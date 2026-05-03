'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Clear existing data in reverse dependency order
  console.log('Clearing existing data...');
  await prisma.notification.deleteMany();
  await prisma.emailEvent.deleteMany();
  await prisma.sequenceEnrollment.deleteMany();
  await prisma.sequenceStep.deleteMany();
  await prisma.emailSequence.deleteMany();
  await prisma.stageTransition.deleteMany();
  await prisma.pipelineDeal.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.segment.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  console.log('Existing data cleared.');

  // Create organization
  const organization = await prisma.organization.create({
    data: {
      name: 'Demo Company',
    },
  });
  console.log(`Created organization: ${organization.name} (${organization.id})`);

  // Hash passwords
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create admin user
  const admin = await prisma.user.create({
    data: {
      email: 'admin@demo.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'ADMIN',
      organizationId: organization.id,
    },
  });
  console.log(`Created admin user: ${admin.email}`);

  // Create sales rep user
  const salesRep = await prisma.user.create({
    data: {
      email: 'salesrep@demo.com',
      password: hashedPassword,
      name: 'Sales Representative',
      role: 'SALES_REP',
      organizationId: organization.id,
    },
  });
  console.log(`Created sales rep: ${salesRep.email}`);

  // Create 10 demo leads with varied statuses/scores
  const leadsData = [
    {
      firstName: 'Alice',
      lastName: 'Johnson',
      email: 'alice.johnson@acmecorp.com',
      phone: '+1-555-0101',
      company: 'Acme Corp',
      source: 'MANUAL',
      status: 'HOT',
      score: 75,
      tags: ['enterprise', 'high-value'],
    },
    {
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'bob.smith@techstartup.io',
      phone: '+1-555-0102',
      company: 'Tech Startup Inc',
      source: 'API',
      status: 'WARM',
      score: 45,
      tags: ['startup', 'saas'],
    },
    {
      firstName: 'Carol',
      lastName: 'Williams',
      email: 'carol.w@globalfinance.com',
      phone: '+1-555-0103',
      company: 'Global Finance LLC',
      source: 'CSV',
      status: 'COLD',
      score: 10,
      tags: ['finance'],
    },
    {
      firstName: 'David',
      lastName: 'Brown',
      email: 'dbrown@retailchain.com',
      phone: '+1-555-0104',
      company: 'Retail Chain Co',
      source: 'MANUAL',
      status: 'CUSTOMER',
      score: 95,
      tags: ['retail', 'enterprise', 'existing-customer'],
    },
    {
      firstName: 'Eva',
      lastName: 'Martinez',
      email: 'eva.martinez@healthtech.com',
      phone: '+1-555-0105',
      company: 'HealthTech Solutions',
      source: 'MANUAL',
      status: 'HOT',
      score: 68,
      tags: ['healthcare', 'high-value'],
    },
    {
      firstName: 'Frank',
      lastName: 'Lee',
      email: 'frank.lee@educorp.org',
      phone: '+1-555-0106',
      company: 'EduCorp',
      source: 'CSV',
      status: 'WARM',
      score: 35,
      tags: ['education'],
    },
    {
      firstName: 'Grace',
      lastName: 'Kim',
      email: 'grace.kim@mfgworks.com',
      phone: '+1-555-0107',
      company: 'MFG Works',
      source: 'API',
      status: 'COLD',
      score: 5,
      tags: ['manufacturing'],
    },
    {
      firstName: 'Henry',
      lastName: 'Davis',
      email: 'hdavis@logistics360.com',
      phone: '+1-555-0108',
      company: 'Logistics 360',
      source: 'MANUAL',
      status: 'WARM',
      score: 40,
      tags: ['logistics', 'mid-market'],
    },
    {
      firstName: 'Irene',
      lastName: 'Thompson',
      email: 'irene.t@cloudservices.net',
      phone: '+1-555-0109',
      company: 'Cloud Services Ltd',
      source: 'API',
      status: 'HOT',
      score: 62,
      tags: ['cloud', 'saas', 'high-value'],
    },
    {
      firstName: 'James',
      lastName: 'Wilson',
      email: 'jwilson@consultingpro.com',
      phone: '+1-555-0110',
      company: 'Consulting Pro',
      source: 'MANUAL',
      status: 'COLD',
      score: 15,
      tags: ['consulting'],
    },
  ];

  const leads = [];
  for (const leadData of leadsData) {
    const lead = await prisma.lead.create({
      data: {
        ...leadData,
        organizationId: organization.id,
      },
    });
    leads.push(lead);
  }
  console.log(`Created ${leads.length} demo leads.`);

  // Create email sequence "Welcome Sequence" with 3 steps
  const sequence = await prisma.emailSequence.create({
    data: {
      name: 'Welcome Sequence',
      organizationId: organization.id,
      steps: {
        create: [
          {
            order: 1,
            subject: 'Welcome to LeadFlow CRM - Getting Started',
            body: `<html>
<body>
  <h1>Welcome, {{firstName}}!</h1>
  <p>Thank you for your interest in our solutions. We're excited to have you on board.</p>
  <p>Over the next few days, we'll share some resources to help you get the most out of our platform:</p>
  <ul>
    <li>Product overview and key features</li>
    <li>Case studies from companies like yours</li>
    <li>A special introductory offer just for you</li>
  </ul>
  <p>If you have any questions right away, feel free to reply to this email or <a href="https://demo.leadflow.com/book">book a quick call</a>.</p>
  <p>Best regards,<br>The LeadFlow Team</p>
</body>
</html>`,
            delayDays: 0,
          },
          {
            order: 2,
            subject: 'How {{company}} Can Benefit From LeadFlow',
            body: `<html>
<body>
  <h1>Hi {{firstName}},</h1>
  <p>We wanted to follow up and share how companies similar to {{company}} are using LeadFlow CRM to grow their sales pipeline.</p>
  <h2>Key Benefits:</h2>
  <ul>
    <li><strong>30% faster lead qualification</strong> with our AI-powered scoring</li>
    <li><strong>2x email open rates</strong> with personalized sequences</li>
    <li><strong>Full pipeline visibility</strong> with our Kanban dashboard</li>
  </ul>
  <p>Ready to see it in action? <a href="https://demo.leadflow.com/demo">Schedule a personalized demo</a> with one of our experts.</p>
  <p>Best regards,<br>The LeadFlow Team</p>
</body>
</html>`,
            delayDays: 3,
          },
          {
            order: 3,
            subject: 'Last Chance: Special Offer for {{firstName}}',
            body: `<html>
<body>
  <h1>Hi {{firstName}},</h1>
  <p>We noticed you haven't had a chance to explore LeadFlow CRM yet, so we wanted to extend a special offer exclusively for you.</p>
  <p><strong>For the next 48 hours only:</strong></p>
  <ul>
    <li>3 months free on any annual plan</li>
    <li>Free onboarding and data migration</li>
    <li>Dedicated account manager for your first 90 days</li>
  </ul>
  <p>Don't miss out — <a href="https://demo.leadflow.com/offer">claim your offer here</a> before it expires.</p>
  <p>If this isn't the right time, no worries! You can <a href="https://demo.leadflow.com/unsubscribe">unsubscribe</a> at any time.</p>
  <p>Best regards,<br>The LeadFlow Team</p>
</body>
</html>`,
            delayDays: 7,
          },
        ],
      },
    },
  });
  console.log(`Created email sequence: ${sequence.name} with 3 steps.`);

  // Create default Sales Pipeline
  const defaultPipeline = await prisma.pipeline.create({
    data: {
      name: 'Sales Pipeline',
      description: 'New → Contacted → Meeting → Proposal → Close',
      type: 'STANDARD',
      stages: [
        { key: 'NEW',            label: 'New',            color: 'blue',   order: 0 },
        { key: 'CONTACTED',      label: 'Contacted',      color: 'amber',  order: 1 },
        { key: 'MEETING_BOOKED', label: 'Meeting Booked', color: 'orange', order: 2 },
        { key: 'PROPOSAL_SENT',  label: 'Proposal Sent',  color: 'purple', order: 3 },
        { key: 'CLOSED_WON',     label: 'Closed Won',     color: 'green',  order: 4, isWon: true },
        { key: 'CLOSED_LOST',    label: 'Closed Lost',    color: 'red',    order: 5, isLost: true },
      ],
      organizationId: organization.id,
      isDefault: true,
    },
  });
  console.log(`Created default pipeline: ${defaultPipeline.name}`);

  // Create 5 pipeline deals covering every active stage
  const dealData = [
    {
      leadId: leads[1].id, // Bob Smith - WARM
      pipelineId: defaultPipeline.id,
      stage: 'NEW',
      value: 8500.0,
      probability: 10,
    },
    {
      leadId: leads[2].id, // Carol Williams - COLD
      pipelineId: defaultPipeline.id,
      stage: 'CONTACTED',
      value: 12000.0,
      probability: 25,
    },
    {
      leadId: leads[4].id, // Eva Martinez - HOT
      pipelineId: defaultPipeline.id,
      stage: 'MEETING_BOOKED',
      value: 15000.0,
      probability: 50,
    },
    {
      leadId: leads[0].id, // Alice Johnson - HOT
      pipelineId: defaultPipeline.id,
      stage: 'PROPOSAL_SENT',
      value: 24000.0,
      probability: 70,
    },
    {
      leadId: leads[3].id, // David Brown - CUSTOMER
      pipelineId: defaultPipeline.id,
      stage: 'CLOSED_WON',
      value: 48000.0,
      probability: 100,
    },
  ];

  for (const deal of dealData) {
    const created = await prisma.pipelineDeal.create({ data: deal });
    await prisma.stageTransition.create({
      data: { dealId: created.id, fromStage: null, toStage: created.stage },
    });
  }
  console.log(`Created ${dealData.length} pipeline deals.`);

  // Create 2 notifications for the admin
  await prisma.notification.create({
    data: {
      userId: admin.id,
      message: 'Welcome to LeadFlow CRM! Your account has been set up successfully.',
      type: 'SUCCESS',
      read: false,
    },
  });

  await prisma.notification.create({
    data: {
      userId: admin.id,
      message: 'New HOT lead: Alice Johnson from Acme Corp just opened your email.',
      type: 'INFO',
      read: false,
    },
  });
  console.log('Created 2 notifications for admin.');

  console.log('\nSeed completed successfully!');
  console.log('Login credentials:');
  console.log('  Admin:    admin@demo.com    / password123');
  console.log('  Sales Rep: salesrep@demo.com / password123');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
