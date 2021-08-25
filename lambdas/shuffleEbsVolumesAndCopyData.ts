import { Context } from "aws-lambda";
import { DynamoDB, EC2, SSM } from "aws-sdk";
import { EbsAutomationState, StepFunctionsTaskEvent } from "./types";

const shuffleEbsVolumesAndCopyData = async (event: StepFunctionsTaskEvent<EbsAutomationState>, context: Context) => {
    console.log("Event:");
    console.log(JSON.stringify(event, null, 4));

    try {
        const ec2 = new EC2();

        const detachVolumeRequest: EC2.DetachVolumeRequest = {
            InstanceId: event.Input.targetInstanceId,
            VolumeId: event.Input.volumeId!,
        };
        console.log("Detaching target volume...");
        const detachVolumeResponse = await ec2.detachVolume(detachVolumeRequest).promise();
        console.log(JSON.stringify(detachVolumeResponse, null, 4));

        const targetVolumeAttachmentRequest: EC2.AttachVolumeRequest = {
            VolumeId: event.Input.volumeId!,
            InstanceId: event.Input.workerInstance?.workerInstanceId!,
            Device: "/dev/sdf",
        };
        console.log("Attaching target volume to worker instance...");
        const targetVolumeAttachmentResponse = await ec2.attachVolume(targetVolumeAttachmentRequest).promise();
        console.log(JSON.stringify(targetVolumeAttachmentResponse, null, 4));

        const replacementVolumeAttachmentRequest: EC2.AttachVolumeRequest = {
            VolumeId: event.Input.workerInstance?.replacementVolumeId!,
            InstanceId: event.Input.workerInstance?.workerInstanceId!,
            Device: "/dev/sdg",
        };
        console.log("Attaching replacement volume to worker instance...");
        const replacementVolumeAttachmentResponse = await ec2.attachVolume(replacementVolumeAttachmentRequest).promise();
        console.log(JSON.stringify(replacementVolumeAttachmentResponse, null, 4));

        const ssmClient = new SSM();
        const sendCommandRequest: SSM.SendCommandRequest = {
            DocumentName: "EBS_Automation_CopyTargetVolumeToReplacement", //Parameterize
            InstanceIds: [event.Input.workerInstance?.workerInstanceId!],
            CloudWatchOutputConfig: {
                CloudWatchOutputEnabled: true
            },
            TimeoutSeconds: 3600,
        };
        console.log("Sending SSM command...");
        const sendCommandResponse = await ssmClient.sendCommand(sendCommandRequest).promise();
        console.log(JSON.stringify(sendCommandResponse.Command, null, 4));

        const ddb = new DynamoDB();
        const putItemRequest: DynamoDB.PutItemInput = {
            TableName: "EBS_Automation_TaskTokens", //Parameterize
            Item: {
                "ResourceId": { S: event.Input.workerInstance?.workerInstanceId! },
                "Stage": { S: "shuffleEbsVolumesAndCopyData" },
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

export const handler = shuffleEbsVolumesAndCopyData;
