const baseUrl = (
  process.env.META_VERIFY_BASE_URL ||
  "https://80-marketing-os.vercel.app"
).replace(/\/+$/, "");

const timeoutMs = 30_000;

async function getJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });
    const body = await response.json();

    return {
      response,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function result(name, passed, detail) {
  return {
    test: name,
    status: passed ? "PASS" : "FAIL",
    detail,
  };
}

async function verify() {
  console.log(
    `80 AI Media Buyer - Phase 1 verification`,
  );
  console.log(`Target: ${baseUrl}`);
  console.log("Mode: READ ONLY");
  console.log("");

  const tests = [];

  try {
    const [
      health,
      connection,
      pages,
      accounts,
      posts,
      adObjects,
      insights,
      settingsPage,
    ] = await Promise.all([
      getJson("/api/meta/health"),
      getJson("/api/meta/oauth/status"),
      getJson("/api/meta/pages"),
      getJson("/api/meta/ad-accounts"),
      getJson("/api/meta/posts"),
      getJson("/api/meta/ad-objects"),
      getJson("/api/meta/insights"),
      fetch(`${baseUrl}/settings/meta`, {
        signal: AbortSignal.timeout(timeoutMs),
      }),
    ]);

    tests.push(
      result(
        "Meta health endpoint",
        health.response.ok &&
          health.body.status === "HEALTHY",
        health.body.status || health.response.status,
      ),
      result(
        "OAuth connection",
        connection.response.ok &&
          connection.body.connected === true,
        connection.body.connection?.status ||
          connection.body.status ||
          connection.response.status,
      ),
      result(
        "Facebook Pages",
        pages.response.ok && pages.body.total > 0,
        `${pages.body.total || 0} pages`,
      ),
      result(
        "Ad Accounts",
        accounts.response.ok &&
          accounts.body.total > 0,
        `${accounts.body.total || 0} accounts`,
      ),
      result(
        "Page Posts",
        posts.response.ok &&
          posts.body.totalPosts > 0,
        `${posts.body.totalPosts || 0} posts`,
      ),
      result(
        "Campaign hierarchy",
        adObjects.response.ok &&
          adObjects.body.totals?.campaigns > 0 &&
          adObjects.body.totals?.adSets > 0 &&
          adObjects.body.totals?.ads > 0,
        `${adObjects.body.totals?.campaigns || 0} campaigns / ${adObjects.body.totals?.adSets || 0} ad sets / ${adObjects.body.totals?.ads || 0} ads`,
      ),
      result(
        "Ad Insights",
        insights.response.ok &&
          insights.body.total > 0,
        `${insights.body.total || 0} records`,
      ),
      result(
        "Read-only contract",
        health.body.readOnly === true &&
          health.body.metaMutationExecuted ===
            false &&
          adObjects.body.readOnly === true &&
          insights.body.readOnly === true,
        "No Meta mutation executed",
      ),
      result(
        "Owner approval guard",
        health.body.ownerApprovalRequired ===
          true,
        "Required for real-spend actions",
      ),
      result(
        "Settings dashboard",
        settingsPage.ok,
        `HTTP ${settingsPage.status}`,
      ),
    );

    for (const check of health.body.checks || []) {
      if (
        check.required &&
        check.status !== "PASS"
      ) {
        tests.push(
          result(
            `Health: ${check.label}`,
            false,
            check.detail,
          ),
        );
      }
    }
  } catch (error) {
    tests.push(
      result(
        "Production request",
        false,
        error instanceof Error
          ? error.message
          : String(error),
      ),
    );
  }

  console.table(tests);

  const passed = tests.filter(
    (test) => test.status === "PASS",
  ).length;
  const failed = tests.length - passed;

  console.log("");
  console.log(
    `Summary: ${passed} passed, ${failed} failed`,
  );

  if (failed > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    "PHASE 1 META INTEGRATION: VERIFIED",
  );
}

await verify();
