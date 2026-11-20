# General Payment supplier onboarding

Updated 11 November 2026. General Payment retains inline vendor selection/creation. Vendor Administration navigation is also available to System Administrator, Finance Associate and Finance Manager through vendors.manage. Requestors do not receive that navigation or vendor-administration permission.

## Requestor

Open New Request → General Payment → Vendor. Select an active APS vendor, or choose Add new vendor and enter supplier details. New suppliers require three actual request-level uploads: BIR 2303, business registration (SEC/DTI), and business permit. Billing and line attachments remain separate. Partial drafts are allowed; submission requires a named supplier and all three files.

A new supplier is stored once with APS ownership and the originating request ID. Repeated draft saves update that same pending proposal, avoiding duplicate vendors. New suppliers are not selectable on other requests while pending. A duplicate APS supplier name gives a recoverable error; use an existing validated supplier or ask Finance about the pending proposal. Procurement ownership remains separate in the shared database.

## Finance Associate

Review the supplier documents using the existing document-validation controls. All documents and line checks must pass before Finance Associate approves. That approval activates the vendor and records the reviewer, time, originating request, and document IDs/versions. Department Head approval alone does not activate it. Returned requests retain their draft/proposal and uploaded evidence; replacement document versions require a new review. Generic vendor updates cannot activate a pending request-bound proposal.

## Persistence and limits

Migration 20261111_0033 persists immutable source ownership. Additive migration 20261111_0034 adds the SEC/DTI document type and permits General Payment business-permit uploads without changing configured Finance document rules. Its downgrade preserves referenced document types. Required supplier uploads are enforced independently of optional document-rule settings. Uploaded binaries use the existing request document storage; vendor records hold document references only.

Only isolated test databases were migrated during development. Apply migrations before launching this feature against another database. The Procurement prototype still needs its backend connection to the shared vendor table. Existing submitted vendor snapshots remain unchanged.

See [supplier onboarding test matrix](supplier-onboarding-qa.md).


## Vendor Administration and verification

Open Vendors → Vendor Administration. Create, edit, deactivate or delete APS vendors using the existing safeguards. Procurement vendors stay read-only. Filter Pending Validation to find request-created suppliers, then select Verify documents. The verification panel lists the three required supplier document types, missing uploads, filenames, current versions and review decisions. View the actual stored document, accept it, or require a replacement/reject with a reason. Reviews use the existing permission-checked and audited document endpoint; posted accounting remains frozen.

Reviewing supplier files in this panel does not approve the request or activate the supplier. Finance Associate still completes the request validation and approval. Pending supplier profile edits/status toggles remain protected. After activation, supplier files can be viewed here while history is retained.
