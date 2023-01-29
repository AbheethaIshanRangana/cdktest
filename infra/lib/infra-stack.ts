import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsp from 'aws-cdk-lib/aws-ecs-patterns';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { CfnParameter } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class InfraStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    console.log('StackEnv', process.env.StackEnv);

    // Create VPC 
    const vpc = new ec2.Vpc(this, `appvpc-${process.env.StackEnv || ''}`, {
      maxAzs: 2     // 2 Azs in region
    });

    // ecr repo
    //const repository = new ecr.Repository(this, `ecr-${process.env.StackEnv || ''}-repository`, {
    //  repositoryName: `ecr-${process.env.StackEnv || ''}-repository`,
    //});

    // ECS cluster
    const cluster = new ecs.Cluster(this, `appcluster-${process.env.StackEnv || ''}`, {
      clusterName: `cluster-${process.env.StackEnv || ''}`,
      vpc: vpc
    });

    // Application Load Balancer
    const alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, `appalb-${process.env.StackEnv || ''}`, {
      vpc: vpc,
      vpcSubnets: { subnets: vpc.publicSubnets},
      internetFacing: true
    });

    // TargetGroup
    const targetGroupHttp = new cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup(this, `targetgroup-http-${process.env.StackEnv || ''}`, {
      port: 8000,
      vpc: vpc,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      targetType: cdk.aws_elasticloadbalancingv2.TargetType.IP
    });

    // Target Group Health Check
    targetGroupHttp.configureHealthCheck({
      path: "/",
      protocol: cdk.aws_elasticloadbalancingv2.Protocol.HTTP,
      port: "8000"
    });

    // Allow HTTP connections
    const listener = alb.addListener(`listener-http-${process.env.StackEnv || ''}`, {
      open: true,
      port: 80
    });

    listener.addTargetGroups(`alb-listener-targetgroup-${process.env.StackEnv || ''}`, {
      targetGroups: [targetGroupHttp]
    });

    // Security Group
    const albsg = new ec2.SecurityGroup(this, `appalbsg-${process.env.StackEnv || ''}`, {
      vpc: vpc,
      allowAllOutbound: true
    });

    albsg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow http traffic"
    );

    alb.addSecurityGroup(albsg);

    // iam role for the task and container
    const taskrole = new iam.Role(this, `taskrole-${process.env.StackEnv || ''}`, {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      roleName: `task-role-${process.env.StackEnv || ''}`,
      description: "Role for the tasks and containers"
    });

    taskrole.attachInlinePolicy(
      new iam.Policy(this, `taskpolicy-${process.env.StackEnv || ''}`, {
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
    const taskdefinition = new ecs.TaskDefinition(this, `task-${process.env.StackEnv || ''}`, {
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
      logging: ecs.LogDriver.awsLogs({ streamPrefix: `app-logs-${process.env.StackEnv || ''}` })
    });

    container.addPortMappings({ containerPort: 8000 });

    // container security group
    const ecssg = new ec2.SecurityGroup(this, `ecssg-${process.env.StackEnv || ''}`, {
      vpc: vpc,
      allowAllOutbound: true
    });

    ecssg.connections.allowFrom(
      albsg, 
      ec2.Port.allTcp(),
      "Application Load Balancer"
    );

    // ECS service
    const ecsservice = new ecs.FargateService(this, `app-ecs-service-${process.env.StackEnv || ''}`, {
      cluster: cluster,
      desiredCount: 2,
      taskDefinition: taskdefinition,
      securityGroups: [ecssg],
      assignPublicIp: true
    });

    ecsservice.attachToApplicationTargetGroup(targetGroupHttp);

    /*
    // Autoscaling based on Memory and CPU usage
    const scalabletarget = ecsservice.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 5
    });

    scalabletarget.scaleOnMemoryUtilization(`ScaleUpMem-${process.env.StackEnv || ''}`, {
      targetUtilizationPercent: 75
    });

    scalabletarget.scaleOnCpuUtilization(`ScaleUpCPU-${process.env.StackEnv || ''}`, {
      targetUtilizationPercent: 75
    });
    */

  }
}
