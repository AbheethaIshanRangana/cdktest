import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsp from 'aws-cdk-lib/aws-ecs-patterns';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { CfnParameter } from 'aws-cdk-lib';
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

  }
}
