"use client";

import { useState } from "react";

const scenarios = [
  {
    label: "Refund $2,400",
    action: "payment.refund",
    target: "cus_8X4Q",
    risk: "HIGH",
    decision: "APPROVAL REQUIRED",
    tone: "review",
    policy: "Refunds above $1,000 require finance approval",
  },
  {
    label: "Send follow-up",
    action: "email.send",
    target: "lead_291",
    risk: "LOW",
    decision: "ALLOWED",
    tone: "allow",
    policy: "Outbound follow-ups are allowed for verified leads",
  },
  {
    label: "Export customer data",
    action: "customer.export",
    target: "workspace_prod",
    risk: "CRITICAL",
    decision: "BLOCKED",
    tone: "deny",
    policy: "Production data exports are denied for autonomous agents",
  },
] as const;

export function LandingDecisionConsole() {
  const [scenario, setScenario] = useState<(typeof scenarios)[number]>(scenarios[0]!);

  return (
    <div className="gate-console" aria-label="Interactive policy decision demo">
      <div className="gate-console-bar">
        <span><i /> LIVE POLICY TRACE</span>
        <code>agent_sales_04</code>
      </div>

      <div className="gate-scenario-tabs" aria-label="Choose an agent action">
        {scenarios.map((item) => (
          <button
            key={item.action}
            type="button"
            className={scenario.action === item.action ? "is-active" : ""}
            onClick={() => setScenario(item)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="gate-trace" key={scenario.action}>
        <div className="gate-trace-line">
          <span>01</span>
          <div><small>ACTION REQUEST</small><strong>{scenario.action}</strong></div>
          <code>{scenario.target}</code>
        </div>
        <div className="gate-trace-line">
          <span>02</span>
          <div><small>RISK CLASSIFIER</small><strong>{scenario.risk}</strong></div>
          <code>12ms</code>
        </div>
        <div className="gate-trace-line">
          <span>03</span>
          <div><small>POLICY MATCH</small><strong>{scenario.policy}</strong></div>
          <code>8ms</code>
        </div>
      </div>

      <div className={`gate-decision gate-decision-${scenario.tone}`}>
        <span>DECISION</span>
        <strong>{scenario.decision}</strong>
        <small>Total evaluation time · 20ms</small>
      </div>
    </div>
  );
}
