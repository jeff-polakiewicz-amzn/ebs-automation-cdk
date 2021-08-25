import { Context } from "aws-lambda";
import { DynamoDB, EC2 } from "aws-sdk";
import { EbsAutomationState, StepFunctionsTaskEvent } from "./types";

const stopTargetInstance = async (event: StepFunctionsTaskEvent<EbsAutomationState>, context: Context) => {
    console.log("Event:");
    console.log(JSON.stringify(event, null, 4));

    try {

        const ec2 = new EC2();
        const stopInstancesRequest: EC2.StopInstancesRequest = {
            InstanceIds: [event.Input.targetInstanceId!],
        };
        console.log("Stopping target instance...");
        const stopInstancesResponse = await ec2.stopInstances(stopInstancesRequest).promise();
        console.log(JSON.stringify(stopInstancesResponse, null, 4));

        const ddb = new DynamoDB();
        const putItemRequest: DynamoDB.PutItemInput = {
            TableName: "EBS_Automation_TaskTokens", //Parameterize
            Item: {
                "ResourceId": { S: event.Input.targetInstanceId },
                "Stage": { S: "stopTargetInstance" },
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

export const handler = stopTargetInstance;
