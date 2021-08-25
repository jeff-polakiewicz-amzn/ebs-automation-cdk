import { EventBridgeEvent, Context } from "aws-lambda";
import { DynamoDB, EC2, StepFunctions } from "aws-sdk";
import { UpdateInstanceInformationDetails } from "./types";

const sendTaskSuccessForSsmAgentActive = async (event: EventBridgeEvent<"AWS API Call via CloudTrail", UpdateInstanceInformationDetails>, context: Context) => {
    console.log("Event:");
    console.log(JSON.stringify(event, null, 4));

    try {
        const instanceId = event.detail.requestParameters.instanceId;
        const ddbTable = "EBS_Automation_TaskTokens"; //Parameterize
        const key: DynamoDB.Key = {
            "ResourceId": { S: instanceId },
            "Stage": { S: "createEbsAutomationInstance" },
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
            output: JSON.stringify({ instanceId: instanceId }),
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

export const handler = sendTaskSuccessForSsmAgentActive;
