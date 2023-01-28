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
    const vpc = new ec2.Vpc(this, `AppVPC-${StackEnv}`, {
      maxAzs: 3     // 3 Azs in region
    });

    // Application Load Balancer
    const alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, `AppALB-${StackEnv}`, {
      vpc: vpc,
      vpcSubnets: { subnets: vpc.publicSubnets},
      internetFacing: true
    });

  }
}
