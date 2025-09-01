import React from "react";

export default function Privacy() {
  return (
    <main className="container mx-auto max-w-3xl p-6 prose">
      <h1>Privacy Policy</h1>
      <p>Last updated: {new Date().toISOString().slice(0,10)}</p>

      <p>
        This application (the “App”) helps you build a personalized health plan. The App is operated on a local network
        for personal testing and evaluation. This Privacy Policy explains how your data is used and your rights under the
        General Data Protection Regulation (GDPR) and applicable privacy laws.
      </p>

      <h2>Data Controller</h2>
      <p>The App owner acts as the data controller for personal data processed by the App.</p>

      <h2>What We Collect</h2>
      <ul>
        <li>Profile and intake information you provide (e.g., name, age, goals, notes).</li>
        <li>Usage data to operate the App locally.</li>
      </ul>

      <h2>Purpose and Legal Basis</h2>
      <p>
        Your data is processed solely to generate and maintain your health plan. The legal basis is your consent (GDPR
        Art. 6(1)(a)). You may withdraw consent at any time by discontinuing use and requesting deletion of your data.
      </p>

      <h2>Third Parties and Data Transfers</h2>
      <p>
        The App uses OpenAI as a processor to assist with plan generation. Your input may be transmitted to OpenAI for
        processing. The App owner does not use your data outside creating your plan. OpenAI’s processing is governed by
        its own terms and privacy policies. International data transfers may occur depending on OpenAI’s infrastructure.
      </p>

      <h2>Retention</h2>
      <p>
        Data is retained for as long as needed to provide the plan or until you request deletion. Backups or cached
        content may persist for a limited time.
      </p>

      <h2>Your Rights</h2>
      <ul>
        <li>Right of access to your personal data.</li>
        <li>Right to rectification of inaccurate or incomplete data.</li>
        <li>Right to erasure (“right to be forgotten”).</li>
        <li>Right to restrict processing.</li>
        <li>Right to data portability.</li>
        <li>Right to object to processing.</li>
        <li>Right not to be subject to automated decision‑making producing legal effects.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Reasonable technical and organizational measures are used to protect your data. No method is 100% secure, and we
        cannot guarantee absolute security.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy requests (access, deletion, questions), contact the App owner/administrator. If you are in the EU/UK,
        you may also lodge a complaint with your supervisory authority.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy from time to time. Material changes will be indicated by updating the “Last updated”
        date above.
      </p>
    </main>
  );
}

