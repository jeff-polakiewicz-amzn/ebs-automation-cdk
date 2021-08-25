import { EventBridgeEvent, Context } from "aws-lambda";
import { DynamoDB, StepFunctions } from "aws-sdk";
import { EbsVolumeNotificationDetails } from "./types";

const sendTaskSuccessForEbsVolumeNotification = async (event: EventBridgeEvent<"EBS Volume Notification", EbsVolumeNotificationDetails>, context: Context) => {
    console.log("Event:");
    console.log(JSON.stringify(event, null, 4));

    try {
        const volumeId = event.resources[0].match(/.*volume\/(vol-.*)/)?.[1];
        const ddbTable = "EBS_Automation_TaskTokens"; //Parameterize
        const key: DynamoDB.Key = {
            "ResourceId": { S: volumeId },
            "Stage": { S: "createReplacementEbsVolume" },
        };

        const ddb = new DynamoDB();
        const getItemRequest: DynamoDB.GetItemInput = {
            TableName: ddbTable,
            Key: key,
        };
        console.log("Looking up task token from DDB...");
        const getItemsResponse = await ddb.getItem(getItemRequest).promise();
        const taskToken = getItemsResponse.Item?.["TaskToken"].S;
        if (!taskToken) {
            console.log("No task token found");
            console.log(JSON.stringify(getItemsResponse, null, 4));
            return;
        }

        const stepFunctionsClient = new StepFunctions();
        const taskSuccessRequest: StepFunctions.SendTaskSuccessInput = {
            taskToken: taskToken,
            output: JSON.stringify({ volumeId: volumeId }),
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

export const handler = sendTaskSuccessForEbsVolumeNotification;
