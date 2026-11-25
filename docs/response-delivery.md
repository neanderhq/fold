# Response delivery setup

The form owner opens **Integrations** from editor Settings or Responses.
Apply the committed migrations before starting a new version. Public submission
commits the response and any delivery intent together. Fold attempts delivery
after the response has been accepted. The owner can refresh activity and retry
pending or failed attempts after resolving the error. A stopped runtime may
leave an intent pending until an owner retries.

## Owner email alerts

Supply `RESEND_API_KEY`, `RESPONSE_ALERT_FROM` (for example
`Fold <alerts@example.com>`) and `RESPONSE_ALERT_SENDER_VERIFIED=true`
after verifying the domain in Resend. The operator and Google setup are
optional. When credentials are absent, the relevant control shows unconfigured.

The form owner enables alerts and confirms their account email if needed.
Only completed responses activate an alert, and each email has a protected
response link without answer values. Fold shows when Resend accepts the
message. Provider acceptance does not establish mailbox delivery. An alert
older than 23 hours requires inbox reconciliation before taking further action,
because Resend's request idempotency lasts 24 hours. Disabling alerts cancels
outstanding attempts.

## Google Sheets

An operator enables the Sheets API and supplies a dedicated, non-delegated
service account via `GOOGLE_SHEETS_SERVICE_EMAIL` and
`GOOGLE_SHEETS_SERVICE_KEY`. The private key remains server-side. The runtime
accepts a single-line PEM value with literal `\n` escapes for the deployment
environment file.

Publish the form, start setup, and share the target spreadsheet with the
service account as Editor. On a tab called `Fold setup`, paste the per-form
verification code in A1. Give Fold the spreadsheet URL, select published fields
and choose **Verify and connect**. The form uses a dedicated output tab
and only future completions are written. After verification you can clear
the setup code.

Keep the Fold tab headers and response markers intact. Use a separate tab
for formulas, custom reporting or rearranging the data. Fold writes all
values as literal strings. Renaming a selected field in Fold keeps its
mapping and original heading. Deleting it or changing its type pauses
delivery until you restore it or connect again with new columns. If a response
was collected while a selected field was unavailable, it remains in Fold.
Disconnecting cancels outstanding writes and leaves spreadsheet rows intact.
Revoke the Google sharing permission separately when the service account no
longer needs file access.

See the [Resend send API](https://resend.com/docs/api-reference/emails/send-email),
[Google service accounts](https://developers.google.com/identity/protocols/oauth2/service-account)
and [Sheets batch updates](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate).
