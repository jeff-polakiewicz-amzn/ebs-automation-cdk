import { Context } from "aws-lambda";
import { DynamoDB, EC2 } from "aws-sdk";
import { EbsAutomationState, StepFunctionsTaskEvent } from "./types";

const createReplacementEbsVolume = async (event: StepFunctionsTaskEvent<EbsAutomationState>, context: Context) => {
    console.log("Event:");
    console.log(JSON.stringify(event, null, 4));

    try {
        const ec2 = new EC2();

        const describeVolumeRequest: EC2.DescribeVolumesRequest = {
            VolumeIds: [event.Input.volumeId!],
        };
        console.log("Describing target volume...");
        const describeVolumeResponse = await ec2.describeVolumes(describeVolumeRequest).promise();
        console.log(JSON.stringify(describeVolumeResponse, null, 4));
        const targetVolume = describeVolumeResponse.Volumes?.[0];

        const createVolumeRequest: EC2.CreateVolumeRequest = {
            AvailabilityZone: targetVolume?.AvailabilityZone!,
            Encrypted: targetVolume?.Encrypted,
            Iops: (targetVolume?.VolumeType === "gp3" || targetVolume?.VolumeType === "io1" || targetVolume?.VolumeType === "io2") ? targetVolume?.Iops : undefined,
            KmsKeyId: targetVolume?.KmsKeyId,
            Size: parseInt(event.Input.size!),
            VolumeType: targetVolume?.VolumeType,
            Throughput: (targetVolume?.VolumeType === "gp3") ? targetVolume?.Throughput : undefined,
        };
        console.log("Creating replacement volume...");
        const createVolumeResponse = await ec2.createVolume(createVolumeRequest).promise();
        console.log(JSON.stringify(createVolumeResponse, null, 4));

        const ddb = new DynamoDB();
        const putItemRequest: DynamoDB.PutItemInput = {
            TableName: "EBS_Automation_TaskTokens", //Parameterize
            Item: {
                "ResourceId": { S: createVolumeResponse.VolumeId },
                "Stage": { S: "createReplacementEbsVolume" },
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

export const handler = createReplacementEbsVolume;
