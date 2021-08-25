import { Construct, Duration, Stack, StackProps, Environment } from "@aws-cdk/core";
import { Runtime } from '@aws-cdk/aws-lambda';
import { readFileSync } from "fs";
import { join } from "path";
import { NodejsFunction, NodejsFunctionProps } from '@aws-cdk/aws-lambda-nodejs';
import { Effect, PolicyStatement } from "@aws-cdk/aws-iam";
import { AttributeType, BillingMode, Table } from "@aws-cdk/aws-dynamodb";
import { Document } from "cdk-ssm-document";
import { IntegrationPattern, JsonPath, LogLevel, Parallel, StateMachine, TaskInput } from "@aws-cdk/aws-stepfunctions";
import { LambdaInvoke } from '@aws-cdk/aws-stepfunctions-tasks';
import { LogGroup } from "@aws-cdk/aws-logs";
import { Rule } from "@aws-cdk/aws-events";
import { LambdaFunction, SfnStateMachine } from "@aws-cdk/aws-events-targets";

export class EbsAutomationCdkStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const account = Stack.of(this).account;

        const nodeJsFunctionProps: NodejsFunctionProps = {
            bundling: {
                externalModules: [
                    'aws-sdk', // Use the 'aws-sdk' available in the Lambda runtime
                ],
            },
            depsLockFilePath: join(__dirname, '..', 'package-lock.json'),
            environment: {},
            runtime: Runtime.NODEJS_14_X,
        };

        const ssm_ResizeDriveAndGetVolumeId = new Document(this, "ssm_ResizeDriveAndGetVolumeId", {
            name: "EBS_Automation_ResizeDriveAndGetVolumeId",
            updateDefaultVersion: true,
            documentType: "Command",
            targetType: "/AWS::EC2::Instance",
            content: readFileSync(join(__dirname, '../scripts', 'EBS_Automation_ResizeDriveAndGetVolumeId.yaml')).toString(),
        });

        const ssm_CopyTargetVolumeToReplacement = new Document(this, "ssm_CopyTargetVolumeToReplacement", {
            name: "EBS_Automation_CopyTargetVolumeToReplacement",
            updateDefaultVersion: true,
            documentType: "Command",
            targetType: "/AWS::EC2::Instance",
            content: readFileSync(join(__dirname, '../scripts', 'EBS_Automation_CopyTargetVolumeToReplacement.yaml')).toString(),
        });

        const lambda_resizeDriveAndGetVolumeId = new NodejsFunction(this, 'lambda_resizeDriveAndGetVolumeId', {
            ...nodeJsFunctionProps,
            functionName: "EBS_Automation_ResizeDriveAndGetVolumeId",
            description: "Initiates SSM command to resize partition, which returns the EBS volume id.",
            timeout: Duration.seconds(5),
            entry: join(__dirname, '../lambdas', 'resizeDriveAndGetVolumeId.ts'),
            initialPolicy: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ["ssm:SendCommand"],
                    resources: [
                        `arn:aws:ssm:*:${account}:document/EBS_Automation*`,
                        "arn:aws:ec2:*:*:instance/*",
                    ],
                }),
            ]
        });

        const lambda_sendTaskSuccessForCommandStatusChange = new NodejsFunction(this, 'lambda_sendTaskSuccessForCommandStatusChange', {
            ...nodeJsFunctionProps,
            functionName: "EBS_Automation_SendTaskSuccessForCommandStatusChange",
            description: "Sends task success to state machine for SSM run command success.",
            timeout: Duration.seconds(10),
            entry: join(__dirname, '../lambdas', 'sendTaskSuccessForCommandStatusChange.ts'),
            initialPolicy: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ["ssm:ListCommandInvocations"],
                    resources: ["*"],
                }),
            ]
        });

        const lambda_createEbsAutomationInstance = new NodejsFunction(this, 'lambda_createEbsAutomationInstance', {
            ...nodeJsFunctionProps,
            functionName: "EBS_Automation_CreateEbsAutomationInstance",
            description: "Creates an EC2 instance to run EBS automation tasks.",
            timeout: Duration.seconds(10),
            entry: join(__dirname, '../lambdas', 'createEbsAutomationInstance.ts'),
            initialPolicy: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "ec2:DescribeInstances",
                        "ec2:CreateTags",
                        "ec2:RunInstances",
                    ],
                    resources: ["*"],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ["iam:PassRole"],
                    resources: [`arn:aws:iam::${account}:role/AmazonSSMRoleForInstancesQuickSetup`], //Role that allows AmazonSSMManagedInstanceCore
                }),
            ]
        });

        const lambda_sendTaskSuccessForSsmAgentActive = new NodejsFunction(this, 'lambda_sendTaskSuccessForSsmAgentActive', {
            ...nodeJsFunctionProps,
            functionName: "EBS_Automation_SendTaskSuccessForSsmAgentActive",
            description: "Sends task success to state machine for worker instance connecting to SSM successfully.",
            timeout: Duration.seconds(5),
            entry: join(__dirname, '../lambdas', 'sendTaskSuccessForSsmAgentActive.ts'),
        });

        const lambda_createReplacementEbsVolume = new NodejsFunction(this, 'lambda_createReplacementEbsVolume', {
            ...nodeJsFunctionProps,
            functionName: "EBS_Automation_CreateReplacementEbsVolume",
            description: "Creates the replacement EBS volume run EBS automation tasks.",
            timeout: Duration.seconds(5),
            entry: join(__dirname, '../lambdas', 'createReplacementEbsVolume.ts'),
            initialPolicy: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "ec2:DescribeVolumes",
                        "ec2:CreateVolume",
                    ],
                    resources: ["*"],
                }),
            ]
        });

        const lambda_sendTaskSuccessForEbsVolumeNotification = new NodejsFunction(this, 'lambda_sendTaskSuccessForEbsVolumeNotification', {
            ...nodeJsFunctionProps,
            functionName: "EBS_Automation_SendTaskSuccessForEbsVolumeNotification",
            description: "Sends task success to state machine for replacement volume creating successfully.",
            timeout: Duration.seconds(5),
            entry: join(__dirname, '../lambdas', 'sendTaskSuccessForEbsVolumeNotification.ts'),
        });

        const lambda_stopTargetInstance = new NodejsFunction(this, 'lambda_stopTargetInstance', {
            ...nodeJsFunctionProps,
            functionName: "EBS_Automation_StopTargetInstance",
            description: "Stops the target instance to run EBS automation tasks.",
            timeout: Duration.seconds(5),
            entry: join(__dirname, '../lambdas', 'stopTargetInstance.ts'),
            initialPolicy: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "ec2:StopInstances",
                    ],
                    resources: ["*"],
                }),
            ]
        });

        const lambda_sendTaskSuccessForEc2InstanceStateChange = new NodejsFunction(this, 'lambda_sendTaskSuccessForEc2InstanceStateChange', {
            ...nodeJsFunctionProps,
            functionName: "EBS_Automation_SendTaskSuccessForEc2InstanceStateChange",
            description: "Sends task success to state machine for target instance stopping.",
            timeout: Duration.seconds(10),
            entry: join(__dirname, '../lambdas', 'sendTaskSuccessForEc2InstanceStateChange.ts'),
        });

        const lambda_shuffleEbsVolumesAndCopyData = new NodejsFunction(this, 'lambda_shuffleEbsVolumesAndCopyData', {
            ...nodeJsFunctionProps,
            functionName: "EBS_Automation_ShuffleEbsVolumesAndCopyData",
            description: "Shuffles EBS volumes to worker instance, and initiates SSM command to copy data.",
            timeout: Duration.seconds(15),
            entry: join(__dirname, '../lambdas', 'shuffleEbsVolumesAndCopyData.ts'),
            initialPolicy: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ["ssm:SendCommand"],
                    resources: [
                        `arn:aws:ssm:*:${account}:document/EBS_Automation*`,
                        "arn:aws:ec2:*:*:instance/*",
                    ],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "ec2:DetachVolume",
                        "ec2:AttachVolume",
                    ],
                    resources: ["*"],
                }),
            ]
        });

        const lambda_attachReplacementVolumeAndCleanup = new NodejsFunction(this, 'lambda_attachReplacementVolumeAndCleanup', {
            ...nodeJsFunctionProps,
            functionName: "EBS_Automation_AttachReplacementVolumeAndCleanup",
            description: "Attaches replacement EBS volume to target instance, restarts target, and deletes old volumes and worker instance.",
            timeout: Duration.seconds(15),
            entry: join(__dirname, '../lambdas', 'attachReplacementVolumeAndCleanup.ts'),
            initialPolicy: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "ec2:DetachVolume",
                        "ec2:AttachVolume",
                        "ec2:DeleteVolume",
                        "ec2:TerminateInstances",
                        "ec2:StartInstances",
                    ],
                    resources: ["*"],
                }),
            ]
        });

        const ddb_EbsAutomationTaskTokens = new Table(this, "ddb_EbsAutomationTaskTokens", {
            tableName: "EBS_Automation_TaskTokens",
            partitionKey: {
                name: "ResourceId",
                type: AttributeType.STRING,
            },
            sortKey: {
                name: "Stage",
                type: AttributeType.STRING,
            },
            serverSideEncryption: true,
            billingMode: BillingMode.PAY_PER_REQUEST,
        });
        ddb_EbsAutomationTaskTokens.grantWriteData(lambda_resizeDriveAndGetVolumeId);
        ddb_EbsAutomationTaskTokens.grantReadWriteData(lambda_sendTaskSuccessForCommandStatusChange);
        ddb_EbsAutomationTaskTokens.grantWriteData(lambda_createEbsAutomationInstance);
        ddb_EbsAutomationTaskTokens.grantReadWriteData(lambda_sendTaskSuccessForSsmAgentActive);
        ddb_EbsAutomationTaskTokens.grantWriteData(lambda_createReplacementEbsVolume);
        ddb_EbsAutomationTaskTokens.grantReadWriteData(lambda_sendTaskSuccessForEbsVolumeNotification);
        ddb_EbsAutomationTaskTokens.grantWriteData(lambda_stopTargetInstance);
        ddb_EbsAutomationTaskTokens.grantReadWriteData(lambda_sendTaskSuccessForEc2InstanceStateChange);
        ddb_EbsAutomationTaskTokens.grantWriteData(lambda_shuffleEbsVolumesAndCopyData);

        const steps_resizeDriveAndGetVolumeId = new LambdaInvoke(this, "Resize Volume and Get Volume ID", {
            lambdaFunction: lambda_resizeDriveAndGetVolumeId,
            payload: TaskInput.fromObject({
                "Input": JsonPath.entirePayload,
                "TaskToken": JsonPath.taskToken,
            }),
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        });

        const ebsAutomationParallel = new Parallel(this, "Create Worker, Replacement Volume, and Stop Target", {
            resultSelector: {
                "workerInstanceId.$": "$[0].instanceId",
                "replacementVolumeId.$": "$[1].volumeId"
            },
            resultPath: "$.workerInstance",
        });

        const steps_createEbsAutomationInstance = new LambdaInvoke(this, "Create Worker Instance", {
            lambdaFunction: lambda_createEbsAutomationInstance,
            payload: TaskInput.fromObject({
                "Input": JsonPath.entirePayload,
                "TaskToken": JsonPath.taskToken,
            }),
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        });

        const steps_createReplacementEbsVolume = new LambdaInvoke(this, "Create Replacement Volume", {
            lambdaFunction: lambda_createReplacementEbsVolume,
            payload: TaskInput.fromObject({
                "Input": JsonPath.entirePayload,
                "TaskToken": JsonPath.taskToken,
            }),
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        });

        const steps_stopTargetInstance = new LambdaInvoke(this, "Stop Target Instance", {
            lambdaFunction: lambda_stopTargetInstance,
            payload: TaskInput.fromObject({
                "Input": JsonPath.entirePayload,
                "TaskToken": JsonPath.taskToken,
            }),
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        });

        ebsAutomationParallel.branch(steps_createEbsAutomationInstance)
            .branch(steps_createReplacementEbsVolume)
            .branch(steps_stopTargetInstance);

        const steps_shuffleEbsVolumesAndCopyData = new LambdaInvoke(this, "Shuffle Volumes and Copy Data", {
            lambdaFunction: lambda_shuffleEbsVolumesAndCopyData,
            payload: TaskInput.fromObject({
                "Input": JsonPath.entirePayload,
                "TaskToken": JsonPath.taskToken,
            }),
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            resultPath: JsonPath.DISCARD,
        });

        const steps_attachReplacementVolumeAndCleanup = new LambdaInvoke(this, "Attach Replacement and Cleanup", {
            lambdaFunction: lambda_attachReplacementVolumeAndCleanup,
            payload: TaskInput.fromObject({
                "Input": JsonPath.entirePayload,
            }),
        });

        const ebsAutomationDefinition = steps_resizeDriveAndGetVolumeId
            .next(ebsAutomationParallel)
            .next(steps_shuffleEbsVolumesAndCopyData)
            .next(steps_attachReplacementVolumeAndCleanup);

        const steps_ebsAutomation = new StateMachine(this, "steps_ebsAutomation", {
            stateMachineName: "EBS_Automation",
            definition: ebsAutomationDefinition,
            logs: {
                level: LogLevel.ALL,
                includeExecutionData: true,
                destination: new LogGroup(this, 'EBS_Automation_Logs'),
            }
        });
        steps_ebsAutomation.grantTaskResponse(lambda_sendTaskSuccessForCommandStatusChange);
        steps_ebsAutomation.grantTaskResponse(lambda_sendTaskSuccessForSsmAgentActive);
        steps_ebsAutomation.grantTaskResponse(lambda_sendTaskSuccessForEbsVolumeNotification);
        steps_ebsAutomation.grantTaskResponse(lambda_sendTaskSuccessForEc2InstanceStateChange);

        const events_CloudWatchAlarmsRule = new Rule(this, "events_CloudWatchAlarmsRule", {
            ruleName: "EBS_Automation_AlarmsRule",
            description: "Triggers EBS_Automation step function when CloudWatch alarm fires.",
            eventPattern: {
                source: ["aws.cloudwatch"],
                detailType: ["CloudWatch Alarm State Change"],
                detail: {
                    alarmName: [{ prefix: "EBS_Automation" }],
                    state: { value: ["ALARM"] },
                },
            },
            targets: [new SfnStateMachine(steps_ebsAutomation)],
        });

        const events_SsmCommandStatusRule = new Rule(this, "events_SsmCommandStatusRule", {
            ruleName: "EBS_Automation_SsmCommandStatusRule",
            description: "Triggers EBS_Automation step function when SSM run command finishes.",
            eventPattern: {
                source: ["aws.ssm"],
                detailType: ["EC2 Command Status-change Notification"],
                detail: {
                    status: ["Success"]
                },
            },
            targets: [new LambdaFunction(lambda_sendTaskSuccessForCommandStatusChange)],
        });

        const events_SsmAgentStatusRule = new Rule(this, "events_SsmAgentStatusRule", {
            ruleName: "EBS_Automation_SsmAgentStatusRule",
            description: "Triggers EBS_Automation step function when SSM Agent status is active for worker instance.",
            eventPattern: {
                source: ["aws.ssm"],
                detailType: ["AWS API Call via CloudTrail"],
                detail: {
                    eventName: ["UpdateInstanceInformation"],
                    requestParameters: {
                        "agentStatus": ["Active"]
                    }
                },
            },
            targets: [new LambdaFunction(lambda_sendTaskSuccessForSsmAgentActive)],
        });

        const events_EbsVolumeNotificationRule = new Rule(this, "events_EbsVolumeNotificationRule", {
            ruleName: "EBS_Automation_EbsVolumeNotificationRule",
            description: "Triggers EBS_Automation step function when EBS volume status changes to available.",
            eventPattern: {
                source: ["aws.ec2"],
                detailType: ["EBS Volume Notification"],
                detail: {
                    event: ["createVolume"]
                },
            },
            targets: [new LambdaFunction(lambda_sendTaskSuccessForEbsVolumeNotification)],
        });

        const events_Ec2InstanceStateRule = new Rule(this, "events_Ec2InstanceStatusRule", {
            ruleName: "EBS_Automation_Ec2InstanceStatusRule",
            description: "Triggers EBS_Automation step function when EC2 instance state changes to stopped.",
            eventPattern: {
                source: ["aws.ec2"],
                detailType: ["EC2 Instance State-change Notification"],
                detail: {
                    state: ["stopped"]
                },
            },
            targets: [new LambdaFunction(lambda_sendTaskSuccessForEc2InstanceStateChange)],
        });
    }
}
