const nodemailer = require("nodemailer");

let resendClient = null;
const getResendClient = () => {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;
  try {
    const { Resend } = require("resend");
    resendClient = new Resend(apiKey);
    return resendClient;
  } catch (err) {
    return null;
  }
};

let smtpTransporter = null;
const getSmtpTransporter = () => {
  if (smtpTransporter) return smtpTransporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } =
    process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === "true" || SMTP_PORT === "465",
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    connectionTimeout: 10000,
  });

  return smtpTransporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  const from = process.env.MAIL_FROM || "Nurturely CRM <onboarding@resend.dev>";

  // 1. Try Resend if configured
  const resend = getResendClient();
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: from.includes("<") ? from : `Nurturely CRM <${from}>`,
        to,
        subject,
        html,
        text,
      });
      if (error) throw new Error(error.message);
      console.log(`✅ [Email Delivery via Resend] Sent to ${to} (Id: ${data?.id})`);
      return { success: true, messageId: data?.id };
    } catch (err) {
      console.warn(`⚠️ [Resend Email Failed]: ${err.message}. Trying SMTP fallback...`);
    }
  }

  // 2. Try SMTP if configured
  const smtp = getSmtpTransporter();
  if (smtp) {
    try {
      const info = await smtp.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });
      console.log(`✅ [Email Delivery via SMTP] Sent to ${to} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ [SMTP Delivery Error] ${to}:`, error.message);
      throw error;
    }
  }

  // 3. Fallback notice (when email service keys are not configured yet)
  console.log(
    `ℹ️ [Email Dispatch] Email notification queued for ${to}: "${subject}". (Configure RESEND_API_KEY or SMTP credentials in .env for external delivery)`
  );

  return { success: true, simulated: true };
};

const sendOtpEmail = async ({ to, otp, purpose = "registration" }) => {
  const subject = `Your Nurturely Verification Code: ${otp}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; text-align: center;">
      <div style="margin-bottom: 20px;">
        <span style="font-size: 24px; font-weight: 800; color: #D6451B;">Nurturely</span>
        <span style="font-size: 13px; font-weight: 700; color: #64748b; margin-left: 6px; background-color: #fff7f5; padding: 3px 8px; border-radius: 6px;">CRM</span>
      </div>
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Verify Your Email Address</h2>
      <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">Use the verification code below to complete your ${purpose}. This code is valid for 5 minutes.</p>
      
      <div style="background-color: #fff5f2; border: 1px dashed #d6451b; border-radius: 12px; padding: 18px; margin: 20px 0; display: inline-block;">
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #D6451B; font-family: monospace;">${otp}</span>
      </div>

      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">If you did not request this verification code, please disregard this email.</p>
    </div>
  `;
  const text = `Your Nurturely verification code is: ${otp}. Valid for 5 minutes for ${purpose}.`;

  return sendEmail({ to, subject, html, text });
};

const sendPasswordResetEmail = async ({ to, resetUrl, name }) => {
  const subject = "Reset Your Nurturely CRM Password";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 24px; text-align: center;">
        <span style="font-size: 24px; font-weight: 800; color: #D6451B;">Nurturely</span>
        <span style="font-size: 14px; color: #64748b; margin-left: 8px;">CRM</span>
      </div>
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">Password Reset Request</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6;">Hello ${name || "there"},</p>
      <p style="color: #475569; font-size: 15px; line-height: 1.6;">We received a request to reset your password. Click below to proceed (valid for 1 hour):</p>
      <div style="margin: 28px 0; text-align: center;">
        <a href="${resetUrl}" style="background-color: #D6451B; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; display: inline-block;">Reset Password</a>
      </div>
    </div>
  `;
  const text = `Hello ${name || "there"},\n\nReset your password here: ${resetUrl}`;
  return sendEmail({ to, subject, html, text });
};

const sendTaskReminderEmail = async ({ to, leadName, taskTitle, dueAt, representativeName }) => {
  const subject = `Task Reminder: ${taskTitle} for ${leadName}`;
  const formattedDate = new Date(dueAt).toLocaleString();
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">Follow-up Due</h3>
      <p style="color: #475569;">Hello ${representativeName || "Sales Rep"},</p>
      <p>Task: <strong>${taskTitle}</strong></p>
      <p>Lead: <strong>${leadName}</strong></p>
      <p>Scheduled For: <strong>${formattedDate}</strong></p>
    </div>
  `;
  const text = `Task: ${taskTitle}\nLead: ${leadName}\nDue: ${formattedDate}`;
  return sendEmail({ to, subject, html, text });
};

module.exports = {
  sendEmail,
  sendOtpEmail,
  sendPasswordResetEmail,
  sendTaskReminderEmail,
};
