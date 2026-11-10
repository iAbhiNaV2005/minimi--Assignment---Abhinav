import { createConversation, saveMessage, isDatabaseEmpty, clearAllData } from './index';

export async function seedDatabase(force = false): Promise<void> {
  if (!force) {
    const empty = await isDatabaseEmpty();
    if (!empty) {
      console.log('[Seed] Database already contains records. Skipping seed.');
      return;
    }
  } else {
    console.log('[Seed] Clearing existing database tables for fresh seed...');
    await clearAllData();
  }

  console.log('[Seed] Seeding evaluation benchmark conversations...');

  // ==========================================
  // CONVERSATION 1: POSTGRES HOSTING (3 Nov 2026 / Last Tuesday)
  // ==========================================
  const conv1Id = 'conv-eval-postgres-nov3';
  await createConversation(conv1Id, 'Postgres Hosting Architecture & Pricing Comparison');

  const nov3UserDate = '2026-11-03T14:15:00.000Z';
  const nov3AssistantDate = '2026-11-03T14:15:03.000Z';

  await saveMessage({
    id: 'msg-nov3-user-1',
    conversation_id: conv1Id,
    role: 'user',
    content:
      'Can you compare Postgres hosting options for our high-traffic SaaS app? Need info on pricing and scaling for Supabase, Neon, AWS RDS, and Railway.',
    created_at: nov3UserDate,
    extracted_entities: ['Postgres', 'Supabase', 'Neon', 'AWS RDS', 'Railway'],
  });

  const nov3Answer = `Here is a detailed architectural and pricing comparison of the top 4 Postgres hosting solutions for your high-traffic SaaS application:

### 1. Supabase (Managed Postgres + BaaS)
- **Architecture**: Dedicated Postgres instance with PgBouncer connection pooling and built-in Auth, Storage, and Realtime.
- **Pricing**:
  - **Free Tier**: $0/mo (500 MB database, 2 projects, auto-pauses after 1 week of inactivity).
  - **Pro Tier**: **$25/month** per project. Includes 8 GB database storage, 100K monthly active users, 250 GB bandwidth/egress ($0.09/GB for overage).
  - **Compute Add-ons**: Small (2 vCPU, 2GB RAM) at $10/mo; Medium (2 vCPU, 4GB RAM) at $50/mo.

### 2. Neon (Serverless Postgres)
- **Architecture**: Decoupled storage and compute with sub-second copy-on-write database branching and instant cold-start auto-scaling.
- **Pricing**:
  - **Free Tier**: 0.5 GB storage, shared CPU, auto-suspends on idle.
  - **Launch Tier**: **$19/month** base fee. Includes 10 GB storage and active compute billed at **$0.16 per Compute Unit (CU) per hour** (1 CU = 1 vCPU, 4GB RAM).
  - **Scale Tier**: $69/month with higher throughput limits and enterprise branching.

### 3. AWS RDS & Aurora Serverless v2
- **Architecture**: Enterprise battle-tested managed relational database with automated multi-AZ failover and read replicas.
- **Pricing**:
  - **Standard RDS (db.t4g.medium)**: ~$0.067/hour (~$49/mo) + $0.115/GB gp3 storage.
  - **Aurora Serverless v2**: Scaled in Aurora Capacity Units (ACUs) at **$0.12 per ACU-hour** (1 ACU = ~2GB RAM). Provides continuous auto-scaling from 0.5 to 128 ACUs.

### 4. Railway (Developer Cloud Platform)
- **Architecture**: Containerized Postgres service with seamless GitHub integration, private networking, and point-in-time recovery.
- **Pricing**:
  - **Hobby**: $5/month platform fee (includes $5 worth of usage).
  - **Pro Tier**: **$20/month** platform fee + raw consumption:
    - Compute: $0.000231 per vCPU per minute (~$10/mo per vCPU).
    - Memory: $0.000046 per GB RAM per minute (~$2/mo per GB).
    - Egress: $0.10 per GB.

### Recommendation
For rapid iteration with pre-built API tooling, choose **Supabase**. For serverless autoscaling with zero-waste standby environments, pick **Neon**. For enterprise-grade compliance, choose **AWS RDS**.`;

  await saveMessage({
    id: 'msg-nov3-asst-1',
    conversation_id: conv1Id,
    role: 'assistant',
    content: nov3Answer,
    created_at: nov3AssistantDate,
    search_queries: ['Supabase pricing 2026', 'Neon Postgres pricing', 'Aurora Serverless v2 pricing'],
    search_sources: [
      { title: 'Supabase Pricing', url: 'https://supabase.com/pricing' },
      { title: 'Neon Serverless Pricing', url: 'https://neon.tech/pricing' },
      { title: 'AWS Aurora Pricing', url: 'https://aws.amazon.com/rds/aurora/pricing/' },
      { title: 'Railway Pricing', url: 'https://railway.app/pricing' },
    ],
    extracted_entities: ['Postgres', 'Supabase', 'Neon', 'AWS RDS', 'Railway'],
  });

  // ==========================================
  // CONVERSATION 2: CRM SHORTLIST (Monday, 9 Nov 2026)
  // ==========================================
  const conv2Id = 'conv-eval-crm-monday';
  await createConversation(conv2Id, 'CRM Shortlist for 20-Person Sales Team');

  const mondayUserDate = '2026-11-09T10:00:00.000Z';
  const mondayAssistantDate = '2026-11-09T10:00:04.000Z';

  await saveMessage({
    id: 'msg-monday-user-1',
    conversation_id: conv2Id,
    role: 'user',
    content:
      'On Monday we need to shortlist 5 CRM tools for a 20-person sales team. What are the best options and their pricing?',
    created_at: mondayUserDate,
    extracted_entities: ['HubSpot', 'Pipedrive', 'Close', 'Zoho', 'Copper', 'CRM'],
  });

  const mondayAnswer = `Here is our agreed shortlist of the **5 best CRM tools for a 20-person sales team**, including pricing calculations per user and total monthly team cost:

### 1. HubSpot Sales Hub (The Comprehensive Powerhouse)
- **Best For**: Scaling teams that require marketing automation, deep email sequences, and native reporting.
- **Recommended Tier**: **Professional** ($90–$100/seat/month billed annually).
- **20-Person Cost**: **~$2,000/month** ($24,000/year). *Note: Requires a mandatory one-time Professional Onboarding fee (~$1,500).*

### 2. Pipedrive (The Pipeline & Usability Specialist)
- **Best For**: High-velocity deal closers who want visual Kanban pipelines without CRM bloat.
- **Recommended Tier**: **Professional** ($49.90/seat/month billed annually).
- **20-Person Cost**: **~$998/month** ($11,976/year). Includes call recording, e-signatures, and advanced reporting.

### 3. Close CRM (The Inside-Sales & Calling Machine)
- **Best For**: High-volume outbound calling, multi-channel automated SMS, and built-in telephony.
- **Recommended Tier**: **Professional** ($299/mo base includes 3 users + $99/additional user).
- **20-Person Cost**: **~$1,980/month** ($23,760/year). Includes power dialer and call coaching.

### 4. Zoho CRM (The Budget & Value Leader)
- **Best For**: Organizations wanting enterprise customization and extensive integrations at low cost.
- **Recommended Tier**: **Professional** ($23/user/month billed annually) or Enterprise ($40/user/mo).
- **20-Person Cost**: **~$460/month** ($5,520/year) on Professional; **$800/month** on Enterprise.

### 5. Copper CRM (The Native Google Workspace Tool)
- **Best For**: Teams operating entirely inside Gmail, Google Calendar, and Google Drive.
- **Recommended Tier**: **Professional** ($29/seat/month billed annually).
- **20-Person Cost**: **~$580/month** ($6,960/year). Zero manual logging required from Gmail.

### Summary Comparison Table (20 Seats)
| Tool | Monthly Cost (20 Seats) | Annual Spend | Key Strength |
| :--- | :--- | :--- | :--- |
| **HubSpot** | ~$2,000 | $24,000 | Best ecosystem & automation |
| **Pipedrive** | ~$998 | $11,976 | Best pipeline UX & velocity |
| **Close CRM** | ~$1,980 | $23,760 | Best calling & multi-channel outbound |
| **Zoho CRM** | ~$460 | $5,520 | Most affordable enterprise depth |
| **Copper** | ~$580 | $6,960 | Best Google Workspace integration |`;

  await saveMessage({
    id: 'msg-monday-asst-1',
    conversation_id: conv2Id,
    role: 'assistant',
    content: mondayAnswer,
    created_at: mondayAssistantDate,
    search_queries: ['HubSpot Sales Hub pricing 2026', 'Pipedrive pricing', 'Close CRM pricing', 'Zoho CRM pricing', 'Copper CRM pricing'],
    search_sources: [
      { title: 'HubSpot Sales Hub Pricing', url: 'https://www.hubspot.com/pricing/sales' },
      { title: 'Pipedrive Pricing Plans', url: 'https://www.pipedrive.com/en/pricing' },
      { title: 'Close CRM Pricing', url: 'https://www.close.com/pricing' },
      { title: 'Zoho CRM Pricing', url: 'https://www.zoho.com/crm/zohocrm-pricing.html' },
      { title: 'Copper CRM Pricing', url: 'https://www.copper.com/pricing' },
    ],
    extracted_entities: ['HubSpot', 'Pipedrive', 'Close', 'Zoho', 'Copper', 'CRM'],
  });

  console.log('[Seed] Database successfully seeded with baseline evaluation turns.');
}

export async function seedDatabaseIfEmpty(): Promise<void> {
  const empty = await isDatabaseEmpty();
  if (empty) {
    await seedDatabase(false);
  }
}

