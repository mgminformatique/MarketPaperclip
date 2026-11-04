# Paperclip Test

Version 1.0.0. A minimal agent for checking that an instructions bundle is loaded correctly. Made by MGM Informatique for the MarketPaperclip purchase and download test. MIT licensed.

This is an instructions package, not a hosted service or an automatic company import. The ZIP contains AGENTS.md, a package manifest, the license, documentation in English and French, and sample tasks. The manifest describes this distribution; it is not an official Paperclip import schema.

## Install manually in Paperclip

Use an existing Paperclip installation with an enabled local adapter that supports instruction bundles and your own model connection. Paperclip documents managed and external bundles with an entry file, usually AGENTS.md, in its [agent guide](https://github.com/paperclipai/paperclip-docs/blob/main/docs/guides/org/agents.md).

1. Extract the ZIP into a new folder and read the files.
2. Create a test agent named Paperclip Test with your existing adapter. Keep recurring heartbeats disabled while testing.
3. On the agent's Instructions page, use a managed bundle and copy AGENTS.md into its entry file, or select the extracted folder as the external bundle root. Do not overwrite another agent's instructions.
4. Save the configuration. Run the adapter's setup check in your Paperclip installation.
5. Assign the task `MP_TEST_READY`. The expected answer is `PAPERCLIP_TEST_OK | 1.0.0 | en`.
6. Assign `MP_TEST_PRET` to check the French marker. See examples/smoke-test.md.

Interface labels can differ by Paperclip version. The instruction-bundle workflow was checked against the official documentation available on 4 November 2026. An actual model run in your Paperclip installation is required to confirm runtime compatibility; this release does not claim that run has already happened.

## Requirements and costs

Paperclip and the model runtime are not included. You provide a working adapter, provider access, and any required model subscription or API usage. The package itself has no executable scripts, third-party dependencies, scheduled jobs, or requested external credentials. A model call may incur charges from your provider.

## Scope and removal

This agent confirms instruction loading and summarizes supplied tasks. It is not a production business automation, a security certification, or proof that a marketplace payment succeeded. Model output is not guaranteed; inspect the actual response.

To stop testing, pause the test agent. Keep other agents unchanged. Archive the extracted folder if you want to retain the purchased version.

Support: [info@mgminformatique.ca](mailto:info@mgminformatique.ca). This is an independent MGM Informatique package, not an official Paperclip product.
