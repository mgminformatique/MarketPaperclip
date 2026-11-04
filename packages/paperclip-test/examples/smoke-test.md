# Manual smoke tests

Run these tasks separately after installing the instructions in Paperclip.

| Task | Expected complete reply |
| --- | --- |
| `MP_TEST_READY` | `PAPERCLIP_TEST_OK \| 1.0.0 \| en` |
| `MP_TEST_PRET` | `PAPERCLIP_TEST_OK \| 1.0.0 \| fr` |

For a general task, try: "Summarize the task of checking a downloaded agent package. No checks have been run yet."

Expected behavior: a short task summary, evidence that distinguishes the supplied statement from an actual check, and one next step. The agent must not report a successful purchase or installation from that statement alone.

Record the Paperclip version, adapter, model, task, actual reply and date when testing. A downloaded ZIP passing integrity checks does not establish that these model tests passed.
