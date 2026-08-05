"use client";

import { useActionState, useState } from "react";
import { finishOnboarding } from "@/app/actions";
import type { DirectoryPerson } from "@/lib/db";
import { SubmitButton } from "@/components/form-controls";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function WelcomeFlow({ people }: { people: DirectoryPerson[] }) {
  const [step, setStep] = useState(0);
  const [state, action] = useActionState(finishOnboarding, undefined);

  return (
    <form action={action} className="welcome-flow">
      <div className="progress-dots" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((dot) => <span key={dot} className={dot === step ? "is-active" : dot < step ? "is-done" : ""} />)}
      </div>

      <section className={`welcome-step ${step === 0 ? "is-active" : ""}`} aria-hidden={step !== 0}>
        <p className="eyebrow">Before we begin</p>
        <h1>When were you born?</h1>
        <p className="lede">We use this once to check eligibility. Your birth date is never stored.</p>
        <div className="date-grid">
          <label><span>Month</span><select name="birthMonth" required defaultValue=""><option value="" disabled>Month</option>{months.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}</select></label>
          <label><span>Day</span><select name="birthDay" required defaultValue=""><option value="" disabled>Day</option>{Array.from({ length: 31 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
          <label><span>Year</span><select name="birthYear" required defaultValue=""><option value="" disabled>Year</option>{Array.from({ length: 90 }, (_, index) => new Date().getFullYear() - index).map((year) => <option key={year}>{year}</option>)}</select></label>
        </div>
        <button type="button" className="button button--primary" onClick={() => setStep(1)}>Continue</button>
      </section>

      <section className={`welcome-step ${step === 1 ? "is-active" : ""}`} aria-hidden={step !== 1}>
        <p className="eyebrow">Your profile</p>
        <h1>Just enough to be found.</h1>
        <p className="lede">Your name is what friends search — no photos, no bio, nothing to judge.</p>
        <div className="two-fields">
          <label><span className="field-label">First name</span><input name="firstName" autoComplete="given-name" required maxLength={30} /></label>
          <label><span className="field-label">Last name</span><input name="lastName" autoComplete="family-name" required maxLength={30} /></label>
        </div>
        <label><span className="field-label">Class year</span><select name="classYear" required defaultValue=""><option value="" disabled>Select year</option>{[2027, 2028, 2029, 2030, 2031].map((year) => <option key={year}>{year}</option>)}</select></label>
        <label><span className="field-label">Mobile number</span><input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(734) 555-0140" required /><span className="field-help">Private. Used only for essential launch messages; never shown to students.</span></label>
        <label className="consent-row"><input name="contactConsent" type="checkbox" required /><span>I agree to receive essential account texts during the manual launch. Message and data rates may apply. I can opt out at any time.</span></label>
        <div className="button-row"><button type="button" className="button button--ghost" onClick={() => setStep(0)}>Back</button><button type="button" className="button button--primary" onClick={() => setStep(2)}>Continue</button></div>
      </section>

      <section className={`welcome-step ${step === 2 ? "is-active" : ""}`} aria-hidden={step !== 2}>
        <p className="eyebrow">Your circle</p>
        <h1>Pick your people.</h1>
        <p className="lede">Choose at least one for now. Polls unlock when four of your people are here.</p>
        <div className="people-list">
          {people.map((person) => (
            <label className="person-check" key={person.id}>
              <input type="checkbox" name="circleIds" value={person.id} />
              <span className="avatar" aria-hidden="true">{person.firstName[0]}{person.lastName[0]}</span>
              <span><strong>{person.firstName} {person.lastName}</strong><small>Class of {person.classYear}{person.isDemo ? " · demo account" : ""}</small></span>
              <span className="check-mark" aria-hidden="true">✓</span>
            </label>
          ))}
        </div>
        {state?.error && <p className="form-error" role="alert">{state.error}</p>}
        <div className="button-row"><button type="button" className="button button--ghost" onClick={() => setStep(1)}>Back</button><SubmitButton pendingText="Setting things up…">Enter Fourteen</SubmitButton></div>
      </section>
    </form>
  );
}
