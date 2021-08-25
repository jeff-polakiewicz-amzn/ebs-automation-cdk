import { Context } from "aws-lambda";
import { DynamoDB, EC2 } from "aws-sdk";
import { EbsAutomationState, StepFunctionsTaskEvent } from "./types";

const createEbsAutomationInstance = async (event: StepFunctionsTaskEvent<EbsAutomationState>, context: Context) => {
    console.log("Event:");
    console.log(JSON.stringify(event, null, 4));

    try {
        const ec2 = new EC2();

        const describeInstanceRequest: EC2.DescribeInstancesRequest = {
            InstanceIds: [event.Input.targetInstanceId!],
        };
        console.log("Describing target instance...");
        const describeInstanceResponse = await ec2.describeInstances(describeInstanceRequest).promise();
        const availabilityZone = describeInstanceResponse.Reservations?.[0].Instances?.[0].Placement?.AvailabilityZone;

        const runInstancesRequest: EC2.RunInstancesRequest = {
            MaxCount: 1,
            MinCount: 1,
            InstanceType: "c6g.2xlarge", //Parameterize
            ImageId: "ami-06cf15d6d096df5d2", //Parameterize
            EbsOptimized: true,
            KeyName: "ebs-automation-org", //Parameterize
            Placement: {
                AvailabilityZone: availabilityZone,
            },
            TagSpecifications: [{
                ResourceType: "instance",
                Tags: [{
                    Key: "Name",
                    Value: "EBS Automation Worker " + context.awsRequestId.substr(0, 10),
                }]
            }],
            IamInstanceProfile: { Name: "AmazonSSMRoleForInstancesQuickSetup" }, //Parameterize
        };
        console.log("Creating worker instance...");
        const runInstancesResponse = await ec2.runInstances(runInstancesRequest).promise();
        console.log(JSON.stringify(runInstancesResponse, null, 4));

        const ddb = new DynamoDB();
        const putItemRequest: DynamoDB.PutItemInput = {
            TableName: "EBS_Automation_TaskTokens", //Parameterize
            Item: {
                "ResourceId": { S: runInstancesResponse.Instances?.[0].InstanceId },
                "Stage": { S: "createEbsAutomationInstance" },
                "TaskToken": { S: event.TaskToken },
            },
        }
        console.log("Saving task token to DDB...");
        const putItemsResponse = await ddb.putItem(putItemRequest).promise();
        console.log(JSON.stringify(putItemsResponse, null, 4));

    } catch (error) {
        console.log(error);
    }
};

export const handler = createEbsAutomationInstance;
