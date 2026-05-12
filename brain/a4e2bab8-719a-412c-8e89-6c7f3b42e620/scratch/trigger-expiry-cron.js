
async function triggerCron() {
  const cronSecret = "replace_with_a_long_random_secret_string";
  const url = "http://localhost:3000/api/cron/expiry-reminders";

  console.log(`Triggering cron at ${url}...`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cronSecret}`,
      },
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`Error: ${response.status} ${text}`);
        return;
    }

    const data = await response.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error triggering cron:", error);
  }
}

triggerCron();
