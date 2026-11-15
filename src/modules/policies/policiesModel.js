const { query } = require('../../config/db');

async function initPoliciesTable() {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS policies (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      title           VARCHAR(255) NOT NULL,
      slug            VARCHAR(191) NOT NULL UNIQUE,
      type            ENUM('privacy','refund','terms','shipping','cookie','custom') DEFAULT 'custom',
      content         LONGTEXT NOT NULL,
      summary         TEXT NULL,
      effective_date  DATE NULL,
      is_published    TINYINT(1) DEFAULT 1,
      meta_title      VARCHAR(255) NULL,
      meta_description TEXT NULL,
      version         VARCHAR(30) DEFAULT '1.0',
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_slug (slug),
      INDEX idx_type (type),
      INDEX idx_published (is_published)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  try {
    await query(createTableSql);

    // Check if any policies exist. If empty, seed standard professional templates.
    const existing = await query(`SELECT COUNT(*) AS cnt FROM policies`);
    if (existing[0]?.cnt === 0) {
      console.log('[Policies] Seeding default legal policies...');
      await seedDefaultPolicies();
    }
  } catch (err) {
    console.error('[Policies] Error initializing policies table:', err.message);
  }
}

async function seedDefaultPolicies() {
  const today = new Date().toISOString().split('T')[0];

  const defaultPolicies = [
    {
      title: 'Privacy Policy',
      slug: 'privacy-policy',
      type: 'privacy',
      summary: 'Learn how we collect, protect, and use your personal information when you use our store and services.',
      effective_date: today,
      is_published: 1,
      meta_title: 'Privacy Policy | Provoke Playtech',
      meta_description: 'Read our transparent Privacy Policy covering personal data protection, payment security, and cookie usage.',
      version: '1.0',
      content: `<h2>1. Introduction & Overview</h2>
<p>Welcome to <strong>Provoke Playtech</strong> ("we", "our", "us"). We value your trust and are deeply committed to protecting your personal information and your right to privacy. This Privacy Policy outlines our practices concerning the collection, use, and disclosure of information that you provide through our website, mobile platforms, and customer service channels.</p>
<p>By accessing or using our services, you consent to the practices described in this Privacy Policy. If you do not agree with any terms herein, please discontinue use of our platform immediately.</p>

<h2>2. Information We Collect</h2>
<p>We collect personal information that you voluntarily provide to us when you register on our store, express an interest in obtaining information about us or our products, place an order, or otherwise contact us.</p>
<ul>
  <li><strong>Personal Identification Details:</strong> Name, email address, phone number, shipping address, and billing address.</li>
  <li><strong>Payment & Transaction Data:</strong> Payment details (processed securely via PCI-DSS compliant third-party gateways like PhonePe; we do not store full credit/debit card numbers or CVV on our servers).</li>
  <li><strong>Account Credentials:</strong> Passwords, security questions, and preferences.</li>
  <li><strong>Device & Usage Data:</strong> IP address, browser type, operating system, pages visited, time spent on pages, and referring URLs collected via cookies and server logs.</li>
</ul>

<h2>3. How We Use Your Information</h2>
<p>We process your information for purposes based on legitimate business interests, the fulfillment of our contract with you, and compliance with legal obligations:</p>
<ul>
  <li>To facilitate order fulfillment, delivery, and real-time shipping notifications.</li>
  <li>To manage user accounts and provide personalized customer support.</li>
  <li>To prevent fraudulent transactions and monitor against security incidents.</li>
  <li>To send promotional updates, seasonal offers, and marketing communications (with your consent, which you can opt out of anytime).</li>
  <li>To comply with legal, tax, and regulatory compliance standards.</li>
</ul>

<h2>4. Sharing of Information</h2>
<p>We only share your information with your consent, to comply with laws, or to fulfill business contracts:</p>
<ul>
  <li><strong>Logistics & Courier Partners:</strong> Delivery carriers (e.g. Shiprocket, Bluedart, Delhivery) receive your name, address, and phone number solely for package delivery.</li>
  <li><strong>Payment Processors:</strong> Encrypted transaction data shared with authorized payment gateways to complete checkout.</li>
  <li><strong>Legal Requirements:</strong> Disclosing information where legally required by applicable laws, court orders, or governmental requests.</li>
</ul>

<h2>5. Data Security & Storage</h2>
<p>We employ high-grade administrative, technical, and physical security safeguards to protect your personal information. All web traffic is encrypted using Secure Socket Layer (SSL/TLS) technology. While we strive to protect your data, no electronic transmission over the Internet can be guaranteed 100% secure.</p>

<h2>6. Cookies & Tracking Technologies</h2>
<p>We use cookies and similar tracking technologies to access or store information. Cookies help us keep your cart contents saved, remember your language preferences, and analyze site traffic for continuous performance improvements. You can manage or disable cookies via your browser settings.</p>

<h2>7. Your Rights & Choices</h2>
<p>Depending on your jurisdiction, you have the right to request access to the personal data we hold about you, request corrections, or request deletion of your account and personal records. To exercise any of these rights, contact our Data Protection desk.</p>

<h2>8. Contact & Grievance Redressal</h2>
<p>If you have any questions, comments, or grievances regarding this Privacy Policy, please reach out to our Grievance Officer:</p>
<div class="callout callout-info">
  <p><strong>Provoke Playtech Customer Support</strong><br/>
  <strong>Email:</strong> support@provokeplaytech.com<br/>
  <strong>Phone:</strong> +91 98765 43210<br/>
  <strong>Address:</strong> 123 Playtime Avenue, Tech Hub, Mumbai, MH, 400001, India</p>
</div>`
    },
    {
      title: 'Cancellation & Refund Policy',
      slug: 'refund-policy',
      type: 'refund',
      summary: 'Detailed terms on order cancellations, product returns, replacement timelines, and refund processing.',
      effective_date: today,
      is_published: 1,
      meta_title: 'Refund & Return Policy | Provoke Playtech',
      meta_description: 'Understand our hassle-free 7-day return, exchange, and refund policies for all online orders.',
      version: '1.0',
      content: `<h2>1. Return & Replacement Window</h2>
<p>At <strong>Provoke Playtech</strong>, your satisfaction is our highest priority. If you receive a product that is defective, damaged in transit, missing parts, or significantly different from what was ordered, you are eligible for a replacement or return within <strong>7 days</strong> of delivery.</p>

<h2>2. Eligibility Criteria for Returns</h2>
<p>To qualify for a valid return or exchange, the item must fulfill the following conditions:</p>
<ul>
  <li>The item must be in its original, unused condition, without any signs of wear, tampering, or misuse.</li>
  <li>All original packaging, outer box, instruction manuals, accessories, warranty cards, and manufacturer tags must be intact.</li>
  <li>The request must be initiated within 7 calendar days of delivery confirmation.</li>
  <li>Proof of purchase (invoice copy or order confirmation number) must be provided.</li>
</ul>

<h2>3. Non-Returnable Items</h2>
<p>The following categories are strictly non-returnable unless received in a damaged or dead-on-arrival condition:</p>
<ul>
  <li>Clearance, final-sale, or flash discount items marked as non-refundable on the product page.</li>
  <li>Consumable products whose seal has been opened (e.g. specialized batteries, lubricants).</li>
  <li>Products showing signs of customer misuse, physical damage, water contact, or unauthorized modifications.</li>
</ul>

<h2>4. Cancellation Policy</h2>
<p>You may cancel an order directly from your user dashboard or by contacting customer support before the order has been dispatched from our fulfillment warehouse. Once an order is handed over to our courier partner and a tracking AWB is generated, the order cannot be canceled and must be processed under the standard return workflow upon delivery.</p>

<h2>5. How to Initiate a Return</h2>
<ol>
  <li>Log in to your account and navigate to <strong>My Orders</strong> &gt; <strong>Request Return / Replacement</strong>.</li>
  <li>Select the reason for return and upload clear photos or a short video demonstrating the defect or transit damage.</li>
  <li>Our quality assurance team will review and approve the request within <strong>24 to 48 business hours</strong>.</li>
  <li>Once approved, a reverse courier pickup will be scheduled from your delivery address at no extra cost to you.</li>
</ol>

<h2>6. Refund Processing & Timelines</h2>
<p>Once the returned merchandise arrives at our inspection facility, our technical team verifies its condition within 2 business days. Upon successful verification:</p>
<ul>
  <li><strong>Prepaid Orders (UPI, Cards, Net Banking):</strong> The refund amount will be credited back to the original source payment account within <strong>5 to 7 business days</strong>.</li>
  <li><strong>Cash on Delivery (COD) Orders:</strong> Refunds will be issued via NEFT/IMPS bank transfer or instant store credit wallet, per your preference.</li>
</ul>

<h2>7. Contact for Refund Support</h2>
<p>For any queries or tracking your ongoing return status:</p>
<div class="callout callout-info">
  <p><strong>Returns Department:</strong> returns@provokeplaytech.com<br/>
  <strong>Support Hotline:</strong> +91 98765 43210 (Mon - Sat, 10:00 AM - 7:00 PM IST)</p>
</div>`
    },
    {
      title: 'Terms & Conditions',
      slug: 'terms-and-conditions',
      type: 'terms',
      summary: 'Rules, disclaimers, and legal obligations governing your access and purchases on Provoke Playtech.',
      effective_date: today,
      is_published: 1,
      meta_title: 'Terms and Conditions | Provoke Playtech',
      meta_description: 'Read the official terms and conditions for using Provoke Playtech platform and purchasing our products.',
      version: '1.0',
      content: `<h2>1. Agreement to Terms</h2>
<p>These Terms and Conditions constitute a legally binding agreement between you ("Customer", "User", "You") and <strong>Provoke Playtech</strong> ("Company", "We", "Us"). By accessing our website, browsing our catalog, or purchasing items, you acknowledge that you have read, understood, and agreed to be bound by all of these Terms.</p>

<h2>2. Eligibility & Account Security</h2>
<p>By creating an account on our platform, you represent that you are at least 18 years old or are accessing the site under the supervision of a parent or legal guardian. You are solely responsible for maintaining the confidentiality of your username, password, and for all activities that occur under your account.</p>

<h2>3. Products, Pricing & Accuracy</h2>
<p>We strive to display the colors, specifications, features, and prices of all products as accurately as possible. However, slight variations in color or packaging may occur due to display monitor calibrations or manufacturer revisions.</p>
<ul>
  <li>Prices for all items are subject to change without prior notice.</li>
  <li>We reserve the right to correct any typographical errors, inaccuracies, or omissions, and to change or update information or cancel orders if any information in the store is inaccurate at any time.</li>
  <li>In the event an item is listed at an incorrect price due to a system glitch, we reserve the right to cancel any orders placed for such items and issue an immediate full refund.</li>
</ul>

<h2>4. Order Acceptance & Billing</h2>
<p>Your receipt of an electronic or other form of order confirmation does not signify our acceptance of your order, nor does it constitute confirmation of our offer to sell. We reserve the right at any time after receipt of your order to accept or decline your order for reasons including non-availability of stock, failure of payment authorization, or suspicion of fraudulent activity.</p>

<h2>5. Intellectual Property Rights</h2>
<p>All content included on this site, including text, logos, graphics, icons, images, digital downloads, audio clips, and software code, is the property of Provoke Playtech or its content suppliers and protected by national and international copyright and trademark laws. Unauthorized copying, modification, distribution, or reproduction is strictly prohibited.</p>

<h2>6. Prohibited Activities</h2>
<p>You agree not to use our platform for any of the following unauthorized purposes:</p>
<ul>
  <li>Using the website in any manner that could disable, overburden, damage, or impair site performance.</li>
  <li>Attempting to gain unauthorized access to any portion of the platform, user accounts, or server databases.</li>
  <li>Using automated crawlers, bots, scrapers, or other automated means to harvest data without our express written consent.</li>
  <li>Engaging in fraudulent chargebacks or dishonest claims.</li>
</ul>

<h2>7. Limitation of Liability</h2>
<p>To the maximum extent permitted by applicable law, in no event shall Provoke Playtech, its directors, employees, or partners be liable for any indirect, incidental, punitive, or consequential damages arising out of your access to or use of the service. Our total aggregate liability for any claims under these terms shall not exceed the amount paid by you for the specific transaction giving rise to such claim.</p>

<h2>8. Governing Law & Dispute Resolution</h2>
<p>These terms shall be governed by and construed in accordance with the laws of India. Any disputes arising out of or in connection with these terms shall be subject to the exclusive jurisdiction of the competent courts located in Mumbai, Maharashtra, India.</p>`
    },
    {
      title: 'Shipping & Delivery Policy',
      slug: 'shipping-policy',
      type: 'shipping',
      summary: 'Shipping rates, dispatch schedules, transit durations, and delivery guidelines across domestic and remote locations.',
      effective_date: today,
      is_published: 1,
      meta_title: 'Shipping and Delivery Policy | Provoke Playtech',
      meta_description: 'Fast, secure shipping information, delivery timelines, and courier partners at Provoke Playtech.',
      version: '1.0',
      content: `<h2>1. Order Processing Time</h2>
<p>All orders are processed and verified within <strong>24 to 48 hours</strong> (excluding Sundays and national holidays) after payment confirmation. Orders placed on weekends or festive holidays will begin processing on the following business day.</p>

<h2>2. Shipping Rates & Free Shipping</h2>
<p>We provide transparent shipping fees calculated at checkout based on weight, dimensions, and destination pincode:</p>
<ul>
  <li><strong>Standard Domestic Shipping:</strong> ₹49 - ₹99 depending on destination zone.</li>
  <li><strong>Free Shipping:</strong> Available on all eligible retail orders exceeding <strong>₹999</strong>!</li>
  <li><strong>Express Priority Air Shipping:</strong> Optional expedited 2-3 day air delivery available for select metropolitan pin codes.</li>
</ul>

<h2>3. Estimated Delivery Timelines</h2>
<table border="1" cellpadding="8" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 16px 0;">
  <thead>
    <tr style="background-color: #f1f5f9; text-align: left;">
      <th style="padding: 10px; border: 1px solid #cbd5e1;">Region / Zone</th>
      <th style="padding: 10px; border: 1px solid #cbd5e1;">Estimated Transit Days</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 10px; border: 1px solid #cbd5e1;">Tier 1 Metros (Mumbai, Delhi NCR, Bangalore, Chennai, Hyderabad, Kolkata)</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1;">2 - 4 Business Days</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #cbd5e1;">Tier 2 &amp; Tier 3 Cities</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1;">4 - 6 Business Days</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #cbd5e1;">Northeast, J&amp;K, Andaman &amp; Remote Pincodes</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1;">6 - 9 Business Days</td>
    </tr>
  </tbody>
</table>

<h2>4. Tracking Your Consignment</h2>
<p>Once your order has been dispatched from our fulfillment center, you will receive an automated email and SMS notification containing your courier tracking number (AWB) and a direct live-tracking URL. You can also track your shipment status at any time in the <strong>My Orders</strong> section of our website.</p>

<h2>5. Damaged Shipments or Tampered Parcels</h2>
<p>If you notice that the external shipping box is visibly damaged, crushed, or tampered with at the time of delivery, please <strong>refuse delivery</strong> from the courier agent and immediately record photographs/unboxing video. Notify our customer support team within 24 hours so we can promptly dispatch a fresh replacement package.</p>`
    }
  ];

  for (const pol of defaultPolicies) {
    try {
      await query(
        `INSERT INTO policies 
         (title, slug, type, summary, effective_date, is_published, meta_title, meta_description, version, content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title=VALUES(title)`,
        [
          pol.title,
          pol.slug,
          pol.type,
          pol.summary,
          pol.effective_date,
          pol.is_published,
          pol.meta_title,
          pol.meta_description,
          pol.version,
          pol.content
        ]
      );
    } catch (e) {
      console.error(`[Policies] Failed to seed policy ${pol.slug}:`, e.message);
    }
  }

  console.log('[Policies] Default policies successfully seeded.');
}

module.exports = {
  initPoliciesTable,
  seedDefaultPolicies
};
