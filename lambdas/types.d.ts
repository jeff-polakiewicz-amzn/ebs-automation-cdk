export interface CloudWatchAlarmStateChangeDetails {
    alarmName: string;
    state: {
        value: string;
        reason: string;
        reasonData: string;
        timestamp: string;
    }
    previousState: {
        value: string;
        reason: string;
        timestamp: string;
    }
    configuration: {
        description: string;
        metrics: [{
            id: string;
            metricStat: {
                metric: {
                    namespace: string;
                    name: string;
                    dimensions: { [key: string]: string };
                }
                period: number;
                stat: string;
            }
            returnData: boolean;
        }];
    }
}

export interface StepFunctionsExecutionContext<TInput> {
    Execution: {
        Id: string;
        Input: TInput;
        Name: string;
        RoleArn: string;
        StartTime: string;
    }
    StateMachine: {
        Id: string;
        Name: string;
    }
    State: {
        Name: string;
        EnteredTime: string;
        RetryCount: number;
    }
    Task: {
        Token: string;
    }
}

export interface StepFunctionsTaskEvent<TInput> {
    Input: TInput;
    TaskToken: string;
}

export interface Ec2InstanceStateChangeDetails {
    "instance-id": string;
    "state": "pending" | "running" | "shutting-down" | "terminated" | "stopping" | "stopped";
}

export interface EbsVolumeNotificationDetails {
    "result": string;
    "cause": string;
    "event": string;
    "request-id": string;
}

export interface EbsSnapshotNotificationDetails {
    "event": string;
    "result": string;
    "cause": string;
    "request-id": string;
    "snapshot_id": string;
    "source": string;
    "StartTime": string;
    "EndTime": string;
}

export interface UpdateInstanceInformationDetails {
    "eventName": "UpdateInstanceInformation";
    "requestParameters": {
        "instanceId": string;
        "agentVersion": string;
        "agentStatus": string;
        "platformType": string;
        "platformName": string;
        "platformVersion": string;
        "iPAddress": string;
        "computerName": string;
        "agentName": string;
    }
}

export type SsmCommandParameters = { [key: string]: string[] };

export interface SsmCommandStatusChangeDetails {
    "command-id": string;
    "document-name": string;
    "requested-date-time": string;
    "expire-after": string;
    "output-s3bucket-name": string;
    "output-s3key-prefix": string;
    parameters: string;
    status: "Success" | "Pending" | "Failed";
}

export interface EbsAutomationState {
    targetInstanceId?: string;
    volumeId?: string;
    size?: string;
    workerInstance?: {
        workerInstanceId: string;
        replacementVolumeId: string;
    }
}