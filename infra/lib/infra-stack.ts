import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsp from 'aws-cdk-lib/aws-ecs-patterns';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { CfnParameter } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class InfraStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'InfraQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });

    // Setup environment variable
    const StackEnv = new CfnParameter(this, "StackEnv", {
        type: "string",
        description: "The name of the environment (ex: dev, qa, uat, ppe, prd).",
        default: "dev"
    });

    // Create VPC 
    const vpc = new ec2.Vpc(this, `appvpc-${StackEnv}`, {
      maxAzs: 3     // 3 Azs in region
    });

    // Application Load Balancer
    const alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, `appalb-${StackEnv}`, {
      vpc: vpc,
      vpcSubnets: { subnets: vpc.publicSubnets},
      internetFacing: true
    });

    // TargetGroup
    const targetGroupHttp = new cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup(this, `targetgroup-http-${StackEnv}`, {
      port: 80,
      vpc: vpc,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      targetType: cdk.aws_elasticloadbalancingv2.TargetType.IP
    });

    // Target Group Health Check
    targetGroupHttp.configureHealthCheck({
      path: "/health",
      protocol: cdk.aws_elasticloadbalancingv2.Protocol.HTTP
    });

    // Allow HTTP connections
    const listener = alb.addListener(`listener-http-${StackEnv}`, {
      open: true,
      port: 80
    });

    listener.addTargetGroups(`alb-listener-targetgroup-${StackEnv}`, {
      targetGroups: [targetGroupHttp]
    });

    // Security Group
    const albsg = new ec2.SecurityGroup(this, `appalbsg-${StackEnv}`, {
      vpc: vpc,
      allowAllOutbound: true
    });

    albsg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow http traffic"
    );

    alb.addSecurityGroup(albsg);

    // ECS cluster
    const cluster = new ecs.Cluster(this, `appcluster-${StackEnv}`, {
      clusterName: `cluster-${StackEnv}`,
      vpc: vpc
    });

    // iam role for the task and container
    const taskrole = new iam.Role(this, `taskrole-${StackEnv}`, {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      roleName: `task-role-${StackEnv}`,
      description: "Role for the tasks and containers"
    });

    taskrole.attachInlinePolicy(
      new iam.Policy(this, `taskpolicy-${StackEnv}`, {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["SES:*"],
            resources: ["*"]
          })
        ]
      })
    );

    // task definition
    const taskdefinition = new ecs.TaskDefinition(this, `task-${StackEnv}`, {
      family: "task",
      compatibility: ecs.Compatibility.EC2_AND_FARGATE,
      cpu: "256",
      memoryMiB: "512",
      networkMode: ecs.NetworkMode.AWS_VPC,
      taskRole: taskrole
    });

    const container = taskdefinition.addContainer("container", {
      image: ecs.ContainerImage.fromRegistry("cdkapp"),
      memoryLimitMiB: 512,
      logging: ecs.LogDriver.awsLogs({ streamPrefix: `app-logs-${StackEnv}` })
    });

    container.addPortMappings({ containerPort: 8000 });

    // container security group
    const ecssg = new ec2.SecurityGroup(this, `ecssg-${StackEnv}`, {
      vpc: vpc,
      allowAllOutbound: true
    });

    ecssg.connections.allowFrom(
      albsg, 
      ec2.Port.allTcp(),
      "Application Load Balancer"
    );


    // ECS service
    const ecsservice = new ecs.FargateService(this, `app-ecs-service-${StackEnv}`, {
      cluster: cluster,
      desiredCount: 2,
      taskDefinition: taskdefinition,
      securityGroups: [ecssg],
      assignPublicIp: true
    });

    ecsservice.attachToApplicationTargetGroup(targetGroupHttp);

    // Autoscaling based on Memory and CPU usage
    const scalabletarget = ecsservice.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 5
    });

    scalabletarget.scaleOnMemoryUtilization(`ScaleUpMem-${StackEnv}`, {
      targetUtilizationPercent: 75
    });

    scalabletarget.scaleOnCpuUtilization(`ScaleUpCPU-${StackEnv}`, {
      targetUtilizationPercent: 75
    });

  }
}
