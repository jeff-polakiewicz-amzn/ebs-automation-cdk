import { EventBridgeEvent, Context } from "aws-lambda";
import { DynamoDB, EC2, SSM, StepFunctions } from "aws-sdk";
import { EbsAutomationState, SsmCommandParameters, SsmCommandStatusChangeDetails } from "./types";

const sendTaskSuccessForCommandStatusChange = async (event: EventBridgeEvent<"EC2 Command Status-change Notification", SsmCommandStatusChangeDetails>, context: Context) => {
    console.log("Event:");
    console.log(JSON.stringify(event, null, 4));

    try {
        const ssmClient = new SSM();
        const listCommandsRequest: SSM.ListCommandInvocationsRequest = {
            CommandId: event.detail["command-id"],
            Details: true,
        };
        console.log("Looking up command invocation...");
        const listCommandsResponse = await ssmClient.listCommandInvocations(listCommandsRequest).promise();
        const instanceId = listCommandsResponse.CommandInvocations?.[0].InstanceId;

        let taskToken: string | undefined;
        let stateOutput: EbsAutomationState | undefined;

        const ddbTable = "EBS_Automation_TaskTokens"; //Parameterize
        let key: DynamoDB.Key = {
            "ResourceId": { S: instanceId },
            "Stage": { S: "resizeDriveAndGetVolumeId" },
        };
        const ddb = new DynamoDB();

        // Lookup resizeDriveAndGetVolumeId key
        let getItemRequest: DynamoDB.GetItemInput = {
            TableName: ddbTable,
            Key: key,
        };
        console.log("Looking up resizeDriveAndGetVolumeId token from DDB...");
        let getItemsResponse = await ddb.getItem(getItemRequest).promise();
        taskToken = getItemsResponse.Item?.["TaskToken"].S;

        if (!taskToken) {
            //If we didnt find resizeDriveAndGetVolumeId key, try shuffleEbsVolumesAndCopyData key.
            key = {
                "ResourceId": { S: instanceId },
                "Stage": { S: "shuffleEbsVolumesAndCopyData" },
            };
            getItemRequest = {
                TableName: ddbTable,
                Key: key,
            };
            console.log("Looking up shuffleEbsVolumesAndCopyData token from DDB...");
            getItemsResponse = await ddb.getItem(getItemRequest).promise();
            taskToken = getItemsResponse.Item?.["TaskToken"].S;

        } else {
            //If we did find resizeDriveAndGetVolumeId key, parse command output
            const output = listCommandsResponse.CommandInvocations?.[0].CommandPlugins?.[0].Output;
            const size = output?.match(/Size: (\d+)\r?\n/)?.[1];
            const volumeId = output?.match(/Volume: (.*)_.*\r?\n/)?.[1].replace("vol", "vol-");
            console.log("Size: " + size);
            console.log("Volume Id: " + volumeId);
            stateOutput = {
                targetInstanceId: instanceId,
                volumeId,
                size,
            };
        }

        if (!taskToken) {
            //If we still didnt find any task token, return;
            console.log("No task tokens found.")
            return;
        }

        const stepFunctionsClient = new StepFunctions();
        const taskSuccessRequest: StepFunctions.SendTaskSuccessInput = {
            taskToken: taskToken,
            output: JSON.stringify(stateOutput ? stateOutput : {}),
        };
        console.log("Sending task success...");
        const taskSuccessResponse = await stepFunctionsClient.sendTaskSuccess(taskSuccessRequest).promise();
        console.log(JSON.stringify(taskSuccessResponse, null, 4));

        const deleteItemRequest: DynamoDB.DeleteItemInput = {
            TableName: ddbTable,
            Key: key,
        };
        console.log("Deleting task token from DDB...");
        const deleteItemResponse = await ddb.deleteItem(deleteItemRequest).promise();
        console.log(JSON.stringify(deleteItemResponse, null, 4));

    } catch (error) {
        console.log(error);
    }

};

export const handler = sendTaskSuccessForCommandStatusChange;
