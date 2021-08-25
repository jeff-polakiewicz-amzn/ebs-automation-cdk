import { Context } from "aws-lambda";
import { CloudWatchEvents, DynamoDB, EC2 } from "aws-sdk";
import { EbsAutomationState, StepFunctionsTaskEvent } from "./types";

const createEbsAutomationInstance = async (event: StepFunctionsTaskEvent<EbsAutomationState>, context: Context) => {
    console.log("Event:");
    console.log(JSON.stringify(event, null, 4));

    try {
        const ec2 = new EC2();

        const detachReplacementVolumeRequest: EC2.DetachVolumeRequest = {
            InstanceId: event.Input.workerInstance?.workerInstanceId,
            VolumeId: event.Input.workerInstance?.replacementVolumeId!,
        };
        console.log("Detaching replacement volume...");
        const detachReplacementVolumeResponse = await ec2.detachVolume(detachReplacementVolumeRequest).promise();
        console.log(JSON.stringify(detachReplacementVolumeResponse, null, 4));

        const detachTargetVolumeRequest: EC2.DetachVolumeRequest = {
            InstanceId: event.Input.workerInstance?.workerInstanceId,
            VolumeId: event.Input.volumeId!,
        };
        console.log("Detaching target volume...");
        const detachTargetVolumeResponse = await ec2.detachVolume(detachTargetVolumeRequest).promise();
        console.log(JSON.stringify(detachTargetVolumeResponse, null, 4));

        let attached = false;
        while (!attached) {
            await new Promise((resolve) => setTimeout(resolve, 2000)); //apparently EBS does not have state change notifications

            try {
                const replacementVolumeAttachmentRequest: EC2.AttachVolumeRequest = {
                    VolumeId: event.Input.workerInstance?.replacementVolumeId!,
                    InstanceId: event.Input.targetInstanceId!,
                    Device: "/dev/sda1",
                };
                console.log("Attaching replacement volume to target instance...");
                const replacementVolumeAttachmentResponse = await ec2.attachVolume(replacementVolumeAttachmentRequest).promise();
                console.log(JSON.stringify(replacementVolumeAttachmentResponse, null, 4));
                attached = true;
            } catch (e) { }
        }

        const startInstancesRequest: EC2.StartInstancesRequest = {
            InstanceIds: [event.Input.targetInstanceId!],
        };
        console.log("Starting target instance...");
        const startInstancesResponse = await ec2.startInstances(startInstancesRequest).promise();
        console.log(JSON.stringify(startInstancesResponse, null, 4));

        const terminateInstanceRequest: EC2.TerminateInstancesRequest = {
            InstanceIds: [event.Input.workerInstance?.workerInstanceId!],
        };
        console.log("Terminating worker instance...");
        const terminateInstancesResponse = await ec2.terminateInstances(terminateInstanceRequest).promise();
        console.log(JSON.stringify(terminateInstancesResponse, null, 4));

        // Uncomment to delete original volume

        // const deleteVolumeRequest: EC2.DeleteVolumeRequest = {
        //     VolumeId: event.Input.volumeId!,
        // };
        // console.log("Deleting target volume...");
        // const deleteVolumeResponse = await ec2.deleteVolume(deleteVolumeRequest).promise();
        // console.log(JSON.stringify(deleteVolumeResponse, null, 4));

    } catch (error) {
        console.log(error);
        throw error;
    }
};

export const handler = createEbsAutomationInstance;
