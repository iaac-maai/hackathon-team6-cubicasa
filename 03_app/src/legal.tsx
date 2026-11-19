// The terms and conditions and the privacy policy. They describe what the code does: when the code
// changes what it stores or who it sends data to, change these pages and TERMS_VERSION (also in worker/index.ts).

export const TERMS_VERSION = "2026-11-19";
export const UPDATED = "19 November 2026";
export const CONTACT = "luca.obejdeanu@students.iaac.net";

const Mail = () => <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

export function TermsText() {
  return (
    <>
      <h2>1. What Plan precedents is</h2>
      <p>
        Plan precedents is a student project made by Team 6 (Chloe Hraibeh, Jeff El Khoury and Luca Obejdeanu) for the
        AI Methods I course of the MaAI master at IAAC, the Institute for Advanced Architecture of Catalonia, in
        Barcelona. You upload a floor plan, and a neural network finds the five most similar homes among the 5,000 plans
        of the CubiCasa5K dataset. The app is free and has no commercial purpose. It is a demonstration: it may change,
        stop working or be shut down at any time, for example when the course ends.
      </p>

      <h2>2. Who can use it</h2>
      <p>
        The app is meant for the people of the course. You need the team password and your own account. You must be at
        least 16 years old. Give a real email address, keep your password to yourself, and use one account per person.
        You are responsible for what is done with your account.
      </p>

      <h2>3. What you upload</h2>
      <ul>
        <li>Upload only floor plans that you made or that you may share.</li>
        <li>
          Do not upload plans that show personal data, such as the names or the address of the people who live there,
          and do not upload photos of people or anything that is not a floor plan.
        </li>
        <li>
          Your plans stay yours. You let us store them and send them to our model server only to give you the results
          and to keep your saved searches. You can delete them, with your account, at any time.
        </li>
      </ul>

      <h2>4. The results</h2>
      <p>
        The five homes come from CubiCasa5K (Kalervo et al., 2019), which may be used for non-commercial purposes only,
        under its CC BY-NC 4.0 licence. The matches, the room maps and every figure of Look inside are computed by a
        student model. They can be wrong and they are not professional advice: check them yourself before you use them
        for a design decision.
      </p>

      <h2>5. Fair use</h2>
      <p>
        Do not try to break into the app or its servers, read data that is not yours, send automated or mass requests,
        or use the app for anything illegal. If you do, we may close your account.
      </p>

      <h2>6. No guarantee</h2>
      <p>
        We built the app with care, but we give it as it is, with no guarantee that it works or keeps your data
        available. As far as the law allows, we are not responsible for any loss that comes from using it.
      </p>

      <h2>7. Ending and changes</h2>
      <p>
        You can delete your account at any time with "Delete my account" at the bottom of every page. If we change these
        terms, we change the date below and ask you to accept them again. Spanish law applies. Questions: <Mail />.
      </p>
    </>
  );
}

export function PrivacyText() {
  return (
    <>
      <h2>1. Who is responsible</h2>
      <p>
        Team 6 of the AI Methods I course at IAAC, Barcelona: Chloe Hraibeh, Jeff El Khoury and Luca Obejdeanu. For any
        question about your data, or to use your rights, write to <Mail />.
      </p>

      <h2>2. What we keep, and why</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th scope="col">Data</th><th scope="col">Why</th><th scope="col">How long</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Your name and email address</td>
              <td>to create your account and let you sign in</td>
              <td>until you delete your account</td>
            </tr>
            <tr>
              <td>Your password, only as a salted hash (PBKDF2-SHA256, 50,000 rounds); we never see or keep the password itself</td>
              <td>to check your password when you sign in</td>
              <td>until you delete your account</td>
            </tr>
            <tr>
              <td>If you sign in with Google: your Google account id and the picture link Google sends; the sign-in tokens from Google, stored encrypted and never used</td>
              <td>to sign you in with Google</td>
              <td>until you delete your account</td>
            </tr>
            <tr>
              <td>Your sessions: a session id, when it expires, your IP address and your browser's name</td>
              <td>to keep you signed in and to notice misuse</td>
              <td>7 days after your last visit, or until you sign out</td>
            </tr>
            <tr>
              <td>Which version of the terms you accepted, and when</td>
              <td>to show that you agreed to them</td>
              <td>until you delete your account</td>
            </tr>
            <tr>
              <td>The floor plans you upload, the file name, the date, the network you chose, the answer of the model and the 128 numbers the network makes of your plan</td>
              <td>to show you the results, your saved searches, and your earlier uploads that look like a new one</td>
              <td>until you delete your account</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The legal basis is the use of the service you sign up for (article 6(1)(b) of the GDPR), and, for the security
        data of your sessions, our legitimate interest in keeping the app safe (article 6(1)(f)). We do not sell your data,
        show ads, track you or use analytics. Only your own account can see your searches.
      </p>

      <h2>3. Cookies</h2>
      <p>The app uses only the cookies it needs to work, so it asks for no cookie consent:</p>
      <ul>
        <li><code>auth</code>: a hash of the team password, so you don't type it again; 7 days.</li>
        <li><code>better-auth.session_token</code>, with <code>__Secure-</code> in front on the live site: your session, so you stay signed in; 7 days.</li>
        <li>While you sign in with Google, a short-lived cookie that checks the answer comes from your own sign-in.</li>
      </ul>
      <p>All of them are HttpOnly: scripts in the page cannot read them. The fonts are served by the app itself, not by Google.</p>

      <h2>4. Who handles the data for us</h2>
      <ul>
        <li>
          <b>Cloudflare</b> runs the app and stores the database (D1) and the uploaded files (R2), set to Western Europe.
          Like any website, its network also handles your requests close to where you are.
        </li>
        <li>
          <b>Render</b> runs our model server in Frankfurt. It receives each plan you upload to compute the results and
          keeps nothing after answering, apart from its own technical logs.
        </li>
        <li><b>Google</b>, only if you choose to sign in with Google: Google then knows that you used the app.</li>
      </ul>
      <p>
        These companies process the data for us under their own data processing terms. Where data leaves the European
        Union, they rely on the European Commission's standard contractual clauses. Hugging Face, where the model is
        published, and GitHub, where the code is published, receive no data about you.
      </p>

      <h2>5. Your rights</h2>
      <p>
        You can ask to see your data, correct it, take a copy, limit or object to its use, and have it deleted. Deleting
        is one button: "Delete my account", at the bottom of every page, removes your account, your sessions, your saved
        searches, your uploaded plans and their results at once. If you think we handle your data wrongly, you can
        complain to the Spanish data protection authority, the AEPD (<a href="https://www.aepd.es">aepd.es</a>).
      </p>

      <h2>6. Security</h2>
      <p>
        The app works only over HTTPS. A team password and your own account protect it, every query reads only your own
        rows, passwords are kept only as salted hashes, and your data is never in our code or on GitHub. If your data
        were ever exposed, we would tell you and the AEPD within 72 hours.
      </p>

      <h2>7. When the project ends</h2>
      <p>
        This is a course project. When it ends, we will shut the app down and delete its database and files. If this
        policy changes before then, we change the date below and ask you to accept it again.
      </p>
    </>
  );
}
