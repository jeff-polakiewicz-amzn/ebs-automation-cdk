import { EventBridgeEvent, Context } from "aws-lambda";
import { DynamoDB, SSM } from "aws-sdk";
import { CloudWatchAlarmStateChangeDetails, StepFunctionsTaskEvent } from "./types";

const resizeDriveAndGetVolumeId = async (event: StepFunctionsTaskEvent<EventBridgeEvent<"CloudWatch Alarm State Change", CloudWatchAlarmStateChangeDetails>>, context: Context) => {
    console.log("Event:");
    console.log(JSON.stringify(event, null, 4));

    const dimensions = event.Input.detail.configuration.metrics[0].metricStat.metric.dimensions;
    const driveLetter = dimensions.instance;
    const instanceId = dimensions.InstanceId;

    try {
        const ssmClient = new SSM();
        const command: SSM.SendCommandRequest = {
            DocumentName: "EBS_Automation_ResizeDriveAndGetVolumeId", //Parameterize
            InstanceIds: [instanceId],
            Parameters: {
                "DriveLetter": [driveLetter],
            },
            CloudWatchOutputConfig: {
                CloudWatchOutputEnabled: true
            }
        };
        console.log("Sending SSM command...");
        const response = await ssmClient.sendCommand(command).promise();
        console.log(JSON.stringify(response.Command, null, 4));

        const ddb = new DynamoDB();
        const putItemRequest: DynamoDB.PutItemInput = {
            TableName: "EBS_Automation_TaskTokens", //Parameterize
            Item: {
                "ResourceId": { S: instanceId },
                "Stage": { S: "resizeDriveAndGetVolumeId" },
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

export const handler = resizeDriveAndGetVolumeId;
