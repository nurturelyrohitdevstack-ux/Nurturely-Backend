require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const User = require("../Modals/User");
const Lead = require("../Modals/Lead");
const Activity = require("../Modals/Activity");
const Task = require("../Modals/Task");

const seedData = async () => {
  const uri = process.env.Mongoose_uri;
  if (!uri) {
    console.error("❌ Mongoose_uri not set in .env. Please configure your MongoDB Atlas URI first.");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB for seeding...");

    // Clear existing collections if desired
    await User.deleteMany({});
    await Lead.deleteMany({});
    await Activity.deleteMany({});
    await Task.deleteMany({});
    console.log("Cleared existing CRM collections.");

    // 1. Seed Admin & Sales Users
    const admin = await User.create({
      fullName: "Alexander Wright",
      email: "admin@nurturely.io",
      password: "Password@123",
      role: "admin",
      phone: "+1 555-0199",
      isActive: true,
    });

    const sales = await User.create({
      fullName: "Maya Lin",
      email: "sales@nurturely.io",
      password: "Password@123",
      role: "sales",
      phone: "+1 555-0144",
      isActive: true,
    });

    console.log("✅ Seeded Admin (admin@nurturely.io) and Sales (sales@nurturely.io)");

    // 2. Seed Leads (in Indian Rupees ₹)
    const leadsData = [
      {
        fullName: "Aarav Sharma",
        email: "aarav@vancecloud.in",
        phone: "+91 98201 23456",
        company: "Vance Cloud Infotech",
        jobTitle: "VP of Marketing",
        source: "Website",
        status: "Proposal Sent",
        priority: "High",
        estimatedValue: 125000,
        currency: "INR",
        assignedTo: sales._id,
        createdBy: admin._id,
        requirements: "Complete enterprise web application revamp, Next.js architecture, and SEO overhaul for B2B tech.",
        tags: ["High-Ticket", "Enterprise", "Next.js"],
        nextFollowUpAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
      {
        fullName: "Pooja Malhotra",
        email: "pooja@apexlegal.in",
        phone: "+91 98112 34567",
        company: "Apex Legal Partners",
        jobTitle: "Managing Partner",
        source: "Referral",
        status: "Won",
        priority: "High",
        estimatedValue: 180000,
        currency: "INR",
        assignedTo: admin._id,
        createdBy: admin._id,
        requirements: "Full redesign and local SEO dominance retainer for corporate law practice.",
        tags: ["Retainer", "Legal", "SEO"],
        lastContactedAt: new Date(),
      },
      {
        fullName: "Rohan Patel",
        email: "rohan@nordiccraft.com",
        phone: "+91 97234 56789",
        company: "Nordic Craft Roasters",
        jobTitle: "Founder & CEO",
        source: "Google Search",
        status: "Meeting Scheduled",
        priority: "High",
        estimatedValue: 85000,
        currency: "INR",
        assignedTo: sales._id,
        createdBy: sales._id,
        requirements: "Custom e-commerce store with razorpay payment gateway and technical SEO.",
        tags: ["Ecommerce", "Shopify"],
        nextFollowUpAt: new Date(Date.now() + 3 * 60 * 60 * 1000), // Due today
      },
      {
        fullName: "Ananya Deshmukh",
        email: "ananya@kinesishealth.in",
        phone: "+91 99345 67890",
        company: "Kinesis Health Diagnostics",
        jobTitle: "Head of Growth",
        source: "WhatsApp",
        status: "In Negotiation",
        priority: "High",
        estimatedValue: 95000,
        currency: "INR",
        assignedTo: sales._id,
        createdBy: sales._id,
        requirements: "Health clinic appointment scheduling portal and organic keyword strategy.",
        tags: ["HealthTech", "Portal"],
        nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      {
        fullName: "Vikram Singhania",
        email: "vikram@pulsecreative.in",
        phone: "+91 98765 43210",
        company: "Pulse Media Works",
        jobTitle: "Creative Director",
        source: "LinkedIn",
        status: "New",
        priority: "Medium",
        estimatedValue: 45000,
        currency: "INR",
        assignedTo: sales._id,
        createdBy: admin._id,
        requirements: "White-label development partner for upcoming client projects.",
        tags: ["Agency", "White-label"],
      },
      {
        fullName: "Kavita Rao",
        email: "kavita@luminabuild.in",
        phone: "+91 91234 56789",
        company: "Lumina Architects & Interior",
        jobTitle: "Principal Architect",
        source: "Instagram",
        status: "Lost",
        priority: "Low",
        estimatedValue: 55000,
        currency: "INR",
        lostReason: "Postponed project rollout to next financial year due to budget reallocation.",
        assignedTo: sales._id,
        createdBy: sales._id,
        requirements: "Portfolio website redesign with high resolution gallery showcase.",
        tags: ["Portfolio", "Architecture"],
      },
      {
        fullName: "Sameer Joshi",
        email: "sameer@fintechpro.in",
        phone: "+91 98450 11223",
        company: "FinTech Pro Solutions",
        jobTitle: "CTO",
        source: "Cold Outreach",
        status: "Qualified",
        priority: "High",
        estimatedValue: 150000,
        currency: "INR",
        assignedTo: sales._id,
        createdBy: sales._id,
        requirements: "Financial advisory landing page funnel with automated lead scoring and WhatsApp integration.",
        tags: ["Fintech", "High-Value"],
        nextFollowUpAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    ];

    const createdLeads = await Lead.insertMany(leadsData);
    console.log(`✅ Seeded ${createdLeads.length} initial business leads`);

    // 3. Seed Activities
    for (const lead of createdLeads) {
      await Activity.create({
        lead: lead._id,
        createdBy: admin._id,
        type: "status_change",
        summary: `Lead created in stage '${lead.status}'`,
        metadata: { newStatus: lead.status },
      });
    }

    // Add call note to Marcus Vance
    await Activity.create({
      lead: createdLeads[0]._id,
      createdBy: sales._id,
      type: "call",
      summary: "Discovery call completed with VP of Marketing",
      details: "Client loves the Next.js approach. Needs proposal submitted by Friday for board review.",
    });

    // 4. Seed Tasks
    await Task.create({
      title: "Deliver Custom Next.js Architecture Proposal",
      lead: createdLeads[0]._id,
      assignedTo: sales._id,
      createdBy: admin._id,
      type: "Email",
      notes: "Send the finalized PDF proposal and scope of work.",
      dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      priority: "High",
      status: "Pending",
    });

    await Task.create({
      title: "Quick follow-up on e-commerce catalog structure",
      lead: createdLeads[2]._id,
      assignedTo: sales._id,
      createdBy: sales._id,
      type: "Call",
      notes: "Discuss 100+ SKU migration requirements.",
      dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // Due today
      priority: "Medium",
      status: "Pending",
    });

    console.log("✅ Seeded follow-up tasks and activity timeline");
    console.log("\n🎉 Database seeded successfully!");
    console.log("-----------------------------------------");
    console.log("Admin Credentials:  admin@nurturely.io / Password@123");
    console.log("Sales Credentials:  sales@nurturely.io / Password@123");
    console.log("-----------------------------------------\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding error:", error);
    process.exit(1);
  }
};

seedData();
