// The reading pages of the app: guide, features, FAQ, terms and privacy. Readable before you sign in.
// Every number here comes from our notebooks or the model card; change them together when the model changes.
import { PrivacyText, TermsText, UPDATED } from "./legal";

export const PAGES = {
  "/guide": "How to use it",
  "/features": "What it does",
  "/faq": "Questions",
  "/terms": "Terms and conditions",
  "/privacy": "Privacy policy",
} as const;
export type PagePath = keyof typeof PAGES;

function GuideText() {
  return (
    <ol className="steps">
      <li>
        <h2>Open the door</h2>
        <p>Type the team password, then sign in to your account or create one, with your email or with Google. When you create an account, the terms open: read them and tick "I agree".</p>
      </li>
      <li>
        <h2>Choose a network</h2>
        <p>
          <b>v3 · Rooms</b> is the default and the one we recommend: it learned to recognise rooms, so its matches tend to
          share the layout. <b>v2 · Cleaned lines</b> compares the plans cleaned down to their thin lines. <b>v1 · Plain
          autoencoder</b> compares them exactly as drawn. Before you search, the big map shows how the chosen network
          arranges the 5,000 plans: switch networks and watch them move.
        </p>
      </li>
      <li>
        <h2>Choose a plan</h2>
        <p>
          Click the box or drop a file on it: a PNG or JPEG of one floor, up to 5 MB. Clean drawings on a white
          background work best, like the plans of the collection. To try the app, pick one of the four example plans
          from the collection: each one should find itself first.
        </p>
      </li>
      <li>
        <h2>Find similar plans</h2>
        <p>
          The first search can take about a minute: the free model server sleeps when nobody uses it, and the page says
          so while it wakes up. Then your plan flies next to the five closest homes, each one drawn as it is and
          coloured by its rooms, with its distance: the smaller, the more similar.
        </p>
      </li>
      <li>
        <h2>Read the five homes</h2>
        <p>
          Pick a room type in the room key, say Bedroom, and only the bedrooms stay on every room map, with their share of
          the plan. Click a plan's number to see it larger: your plan lies over it in red, like tracing paper, and the
          slider sets how see-through it is.
        </p>
      </li>
      <li>
        <h2>Look inside</h2>
        <p>
          Scroll down. The map lights up the 5,000 plans from the closest to the farthest, then flies to your plan.
          Drag it, zoom with a pinch, a double-click or the + and − buttons, and switch between Dots, Plans and Rooms.
          With the map selected, the arrow keys move it, + and − zoom, 0 shows all. The histogram compares your five
          matches with all 5,000 plans, and the last row shows what every layer of the network computed for your plan.
        </p>
      </li>
      <li>
        <h2>Come back to it</h2>
        <p>
          Every search is saved in your account. Open Saved searches to see one again, with everything, even while the
          model server sleeps. Under the five homes, the app also lists your earlier uploads that look like the new one.
        </p>
      </li>
    </ol>
  );
}

function FeaturesText() {
  const features: [string, string][] = [
    ["Five closest homes", "out of the 5,000 plans of CubiCasa5K, each with its drawing, its rooms from the annotations and its distance to your plan."],
    ["Three networks", "v1 compares the plans as drawn, v2 their cleaned lines, v3 the rooms it learned to see. Each network measures in its own units."],
    ["The room key", "keeps one room type on every room map, on the sheets and on the map of the whole collection, with its share of each plan."],
    ["Tracing paper", "your plan in red over a match, with a slider for how see-through it is."],
    ["The map of the 5,000", "every plan placed by UMAP from the network's 128 numbers, as dots shaded by distance, as drawings or as room maps, with zoom and drag."],
    ["How close the five are", "a histogram of the distances to all 5,000 plans, with the five matches and the median marked."],
    ["What each layer sees", "the four most active channels of every layer, the 128-number code and the output, all computed for your plan by the same ONNX file the server runs."],
    ["Earlier uploads like this one", "the 128 numbers of each of your uploads are kept with your account, so the app can find your own earlier plans that look like a new one."],
    ["Saved searches", "every search stays in your account and opens again with everything, even while the model server sleeps."],
    ["Your own account", "email and password, or Google; only you see your searches, and one button deletes your account and all your data."],
  ];
  return (
    <dl className="features">
      {features.map(([name, text]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  );
}

function FaqText() {
  const questions: [string, React.ReactNode][] = [
    ["What does the distance mean?",
      <>Each network turns a plan into 128 numbers. The distance is how far apart the numbers of two plans are: the smaller, the more alike the network finds them. Compare distances only within one network: each one measures in its own units.</>],
    ["Which network should I use?",
      <>v3, the default. It learned to draw the rooms from the lines, so its neighbours are closer as homes: on our test plans, 34% of its matches have the same number of bedrooms as the plan, against 28% for v2 and 21% for random plans.</>],
    ["How good is the room map of my plan?",
      <>Rough. On our test plans v3 finds the area of the plan well (68% overlap) and puts the living room and the bedrooms roughly in the right places, but it hardly finds bathrooms and kitchens: at 128 px their fixtures and names are mostly gone. Read the room map of your own plan as a sketch. The room maps of the five homes are different: they come from the annotations of CubiCasa5K.</>],
    ["Why did my first search take a minute?",
      <>The model runs on a free server on Render, which sleeps after 15 minutes without requests and needs about a minute to wake up. The page starts waking it as soon as you open it, and tries again by itself.</>],
    ["Can I upload a photo or a hand sketch?",
      <>You can, and you will always get five plans: the network has no way to say “this is not a plan”. It learned from clean drawings, so for photos, sketches or anything else the matches mean little.</>],
    ["Why does my plan sit in the middle of its matches on the map?",
      <>The map was computed once for the 5,000 plans. A new plan has no place of its own on it, so the app puts it at the middle of its five matches. The map keeps neighbours together but bends long distances: trust the shade of the dots more than the gaps.</>],
    ["Why does a plan say “No room annotation”?",
      <>8 of the 5,000 plans of CubiCasa5K come without room outlines, so they have no room map. The Rooms view of the map leaves them out.</>],
    ["Where do the 5,000 plans come from?",
      <>From CubiCasa5K (Kalervo et al., 2019), floor plans of real homes, mostly in Finland. They may be used for non-commercial purposes, under the CC BY-NC 4.0 licence: credit CubiCasa5K if you use them.</>],
    ["Who can see my searches?",
      <>Only you. The app is behind the team password and your own account, and every request reads only the rows of the account that is signed in.</>],
    ["What do you keep, and for how long?",
      <>Your account, your sessions and your searches, until you delete your account. The <a href="/privacy">privacy policy</a> lists everything, why and for how long.</>],
    ["How do I delete my data?",
      <>Click "Delete my account" at the bottom of any page while you are signed in. It removes your account, your sessions, your saved searches, the plans you uploaded and their results.</>],
    ["Who made it?",
      <>Team 6 of the AI Methods I course at IAAC, Barcelona: Chloe Hraibeh, Jeff El Khoury and Luca Obejdeanu. It is a free student project, not a commercial service.</>],
  ];
  return (
    <div className="faq">
      {questions.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}

const BODY: Record<PagePath, () => React.ReactNode> = {
  "/guide": GuideText,
  "/features": FeaturesText,
  "/faq": FaqText,
  "/terms": TermsText,
  "/privacy": PrivacyText,
};

export function InfoPage({ path }: { path: PagePath }) {
  const Body = BODY[path];
  const legal = path === "/terms" || path === "/privacy";
  return (
    <main className="page legal">
      <p className="legal-back"><a href="/">← Plan precedents</a></p>
      <nav className="page-tabs" aria-label="Pages">
        {(Object.keys(PAGES) as PagePath[]).map((p) => (
          <a key={p} href={p} aria-current={p === path ? "page" : undefined}>{PAGES[p]}</a>
        ))}
      </nav>
      <h1>{PAGES[path]}</h1>
      {legal && <p className="muted">Last updated {UPDATED}.</p>}
      <Body />
    </main>
  );
}
