import { EventBridgeEvent, Context } from "aws-lambda";
import { DynamoDB, StepFunctions } from "aws-sdk";
import { Ec2InstanceStateChangeDetails } from "./types";

const sendTaskSuccessForEc2InstanceStateChange = async (event: EventBridgeEvent<"EC2 Instance State-change Notification", Ec2InstanceStateChangeDetails>, context: Context) => {
    console.log("Event:");
    console.log(JSON.stringify(event, null, 4));

    try {
        const instanceId = event.detail["instance-id"];
        const ddbTable = "EBS_Automation_TaskTokens"; //Parameterize
        const key: DynamoDB.Key = {
            "ResourceId": { S: instanceId },
            "Stage": { S: "stopTargetInstance" },
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

export const handler = sendTaskSuccessForEc2InstanceStateChange;
