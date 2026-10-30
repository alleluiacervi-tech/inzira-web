# Route inventory

Dynamic routes are reviewed with representative records; shared components cover their other records. The UI review exercises 42 destinations, including unavailable and redirect states; the flow suite exercises further dynamic records and authenticated transitions. This inventory identifies route templates rather than asserting that every possible state has been tested.

| Route template | Access | Main UI components |
| --- | --- | --- |
| `/about` | Public / authentication | JsonLd, LegalPage |
| `/admin/audit` | Staff / permission controlled | AuditLog, PageStates, ui |
| `/admin/categories` | Staff / permission controlled | CategoryAdmin, PageStates, ui |
| `/admin/content/[kind]/[id]` | Staff / permission controlled | ContentEditor, PageStates, ui |
| `/admin/content` | Staff / permission controlled | ContentEditor, PageStates, ui |
| `/admin/content/replace` | Staff / permission controlled | PageStates, ui, ReplaceTool |
| `/admin/payments` | Staff / permission controlled | Ledger, PendingRefunds, PageStates, ui |
| `/admin/roles` | Staff / permission controlled | PageStates, ui, RolesMatrix |
| `/admin/services` | Staff / permission controlled | PageStates, ui, ServiceAdmin |
| `/admin/system` | Staff / permission controlled | PageStates, console/StageTargets, SystemStatus, ui |
| `/console/clients/[id]` | Staff / permission controlled | console/ClientDetailView |
| `/console/clients` | Staff / permission controlled | console/ClientsListView |
| `/console/identity` | Staff / permission controlled | PageStates |
| `/console/inbox` | Staff / permission controlled | PageStates, console/InboxView |
| `/console/intake` | Staff / permission controlled | PageStates, ui, Intake |
| `/console/my-day` | Staff / permission controlled | console/MyDayView |
| `/console/overview` | Staff / permission controlled | PageStates, console/OverviewView |
| `/console` | Staff / permission controlled | Server-rendered page |
| `/console/requests/[ref]` | Staff / permission controlled | console/RequestDetailView |
| `/console/requests/[ref]/receipt` | Staff / permission controlled | PrintButton, Receipt |
| `/console/requests` | Staff / permission controlled | console/RequestsListView |
| `/console/security` | Staff / permission controlled | console/AccountSecurity, console/SecurityPanel, ui |
| `/console/taxes` | Staff / permission controlled | console/TaxDiary |
| `/` | Public / authentication | PublicNav, Footer, ui, FilingRail, Contact, JsonLd, QuickSteps |
| `/portal/account` | Signed-in customer | AccountSettings, ui |
| `/portal/documents` | Signed-in customer | ui, DocumentCenter |
| `/portal` | Signed-in customer | ui |
| `/portal/requests/[ref]` | Signed-in customer | ui, RequestSide, IdCorrection |
| `/portal/requests/[ref]/pay` | Signed-in customer | PayScreen, Steps, ui |
| `/portal/requests/[ref]/receipt` | Signed-in customer | PrintButton, Receipt |
| `/portal/requests` | Signed-in customer | ui |
| `/privacy` | Public / authentication | LegalPage |
| `/r/[ref]` | Private request capability | Footer, PublicNav, RequestLink, RequestSide, IdCorrection, ui |
| `/r/[ref]/pay` | Private request capability | PayScreen, PublicNav, Steps |
| `/r/[ref]/receipt` | Private request capability | PrintButton, Receipt |
| `/r/[ref]/save` | Private request capability | PublicNav, RequestLink |
| `/services/[slug]` | Public / authentication | PublicNav, Footer, ui, QuickSteps, PriceList, JsonLd |
| `/services` | Public / authentication | PublicNav, Footer, Catalogue |
| `/sign-in` | Public / authentication | PublicNav, SignIn |
| `/staff` | Public / authentication | I18n, PublicNav, StaffSignIn |
| `/staff/set-password` | Public / authentication | I18n, PublicNav, SetPassword |
| `/staff/unlock` | Public / authentication | I18n, PublicNav, StaffSignIn |
| `/start/[slug]` | Public / authentication | PublicNav, StartForm |
| `/start` | Public / authentication | PublicNav, StartForm |
| `/terms` | Public / authentication | LegalPage |
| `/track` | Public / authentication | PublicNav, Footer, Track, ui |

## Server action inventory

These are the exported action entry points. Their presence is not a permission guarantee; authorization, persistence and denied-access behavior are exercised by the unit, backend and browser suites.

| Module | Exported action | Source line |
| --- | --- | --- |
| `app/actions/admin.ts` | `saveService` | 38 |
| `app/actions/admin.ts` | `refund` | 86 |
| `app/actions/admin.ts` | `checkRefund` | 117 |
| `app/actions/admin.ts` | `closeUnclearRefund` | 126 |
| `app/actions/admin.ts` | `savePermissions` | 140 |
| `app/actions/admin.ts` | `inviteStaff` | 161 |
| `app/actions/admin.ts` | `sendPasswordLink` | 208 |
| `app/actions/admin.ts` | `updateStaff` | 222 |
| `app/actions/admin.ts` | `resetStaffTotp` | 243 |
| `app/actions/admin.ts` | `sendTestSms` | 264 |
| `app/actions/admin.ts` | `runJobNow` | 281 |
| `app/actions/admin.ts` | `saveStageTargets` | 297 |
| `app/actions/agent.ts` | `reviewDocument` | 66 |
| `app/actions/agent.ts` | `messageCustomer` | 98 |
| `app/actions/agent.ts` | `clearHold` | 117 |
| `app/actions/agent.ts` | `setStage` | 127 |
| `app/actions/agent.ts` | `markSubmitted` | 157 |
| `app/actions/agent.ts` | `scheduleFollowUp` | 180 |
| `app/actions/agent.ts` | `clearFollowUp` | 193 |
| `app/actions/agent.ts` | `addNote` | 204 |
| `app/actions/agent.ts` | `assignCase` | 212 |
| `app/actions/agent.ts` | `saveFees` | 235 |
| `app/actions/agent.ts` | `sendQuote` | 254 |
| `app/actions/agent.ts` | `closeCase` | 273 |
| `app/actions/agent.ts` | `createIntake` | 294 |
| `app/actions/agent.ts` | `uploadCaseFile` | 337 |
| `app/actions/auth.ts` | `requestCode` | 27 |
| `app/actions/auth.ts` | `requestEmailCode` | 34 |
| `app/actions/auth.ts` | `signIn` | 41 |
| `app/actions/auth.ts` | `signInSecondStep` | 94 |
| `app/actions/auth.ts` | `signInWithEmail` | 114 |
| `app/actions/auth.ts` | `signOut` | 144 |
| `app/actions/auth.ts` | `staffPasswordSignIn` | 168 |
| `app/actions/auth.ts` | `unlockConsole` | 199 |
| `app/actions/auth.ts` | `confirmSecondStep` | 216 |
| `app/actions/categories.ts` | `saveCategory` | 54 |
| `app/actions/categories.ts` | `moveCategory` | 113 |
| `app/actions/categories.ts` | `deleteCategory` | 132 |
| `app/actions/categories.ts` | `getCategoryRw` | 152 |
| `app/actions/console.ts` | `searchConsole` | 62 |
| `app/actions/console.ts` | `listMyStaffAlerts` | 68 |
| `app/actions/console.ts` | `markMyStaffAlertsRead` | 76 |
| `app/actions/console.ts` | `acceptAndAssignRequest` | 85 |
| `app/actions/console.ts` | `declineRequest` | 119 |
| `app/actions/console.ts` | `quoteCustomRequest` | 148 |
| `app/actions/console.ts` | `bulkAssignRequests` | 187 |
| `app/actions/console.ts` | `bulkMessageRequests` | 207 |
| `app/actions/console.ts` | `recordManualPayment` | 227 |
| `app/actions/console.ts` | `revealNationalId` | 297 |
| `app/actions/console.ts` | `revealTin` | 313 |
| `app/actions/console.ts` | `markIdChecked` | 331 |
| `app/actions/console.ts` | `reviewIdentity` | 348 |
| `app/actions/console.ts` | `createClient` | 389 |
| `app/actions/console.ts` | `addClientTag` | 454 |
| `app/actions/console.ts` | `removeClientTag` | 466 |
| `app/actions/console.ts` | `addClientNote` | 477 |
| `app/actions/console.ts` | `saveSavedView` | 490 |
| `app/actions/console.ts` | `deleteSavedView` | 520 |
| `app/actions/content.ts` | `saveKinyarwanda` | 22 |
| `app/actions/content.ts` | `restoreKinyarwanda` | 37 |
| `app/actions/content.ts` | `getServiceRw` | 47 |
| `app/actions/content.ts` | `previewReplace` | 59 |
| `app/actions/content.ts` | `applyReplace` | 70 |
| `app/actions/customer.ts` | `submitRequest` | 68 |
| `app/actions/customer.ts` | `sendMessage` | 259 |
| `app/actions/customer.ts` | `correctSubmittedId` | 275 |
| `app/actions/customer.ts` | `uploadDocument` | 313 |
| `app/actions/customer.ts` | `startPayment` | 346 |
| `app/actions/customer.ts` | `checkPayment` | 414 |
| `app/actions/customer.ts` | `markNotificationsRead` | 425 |
| `app/actions/customer.ts` | `cancelRequest` | 432 |
| `app/actions/customer.ts` | `updateAccount` | 461 |
| `app/actions/customer.ts` | `requestEmailChange` | 482 |
| `app/actions/customer.ts` | `confirmEmailChange` | 494 |
| `app/actions/customer.ts` | `signOutEverywhere` | 516 |
| `app/actions/customer.ts` | `deleteMyDocuments` | 526 |
| `app/actions/customer.ts` | `deleteMyAccount` | 537 |
| `app/actions/links.ts` | `openRequestLink` | 21 |
| `app/actions/links.ts` | `forgetRequest` | 27 |
| `app/actions/links.ts` | `claimRequest` | 34 |
| `app/actions/links.ts` | `resendLink` | 82 |
| `app/actions/links.ts` | `sendSaveLink` | 110 |
| `app/actions/security.ts` | `beginTotp` | 26 |
| `app/actions/security.ts` | `confirmTotp` | 40 |
| `app/actions/security.ts` | `newRecoveryCodesFor` | 59 |
| `app/actions/security.ts` | `disableTotp` | 75 |
| `app/actions/staff-account.ts` | `setMyPassword` | 18 |
| `app/actions/staff-account.ts` | `setMyUsername` | 38 |
| `app/actions/staff-account.ts` | `signOutDevice` | 54 |
| `app/actions/staff-account.ts` | `signOutOtherDevices` | 64 |
| `app/actions/staff-account.ts` | `requestPasswordReset` | 78 |
| `app/actions/staff-account.ts` | `readPasswordLink` | 97 |
| `app/actions/staff-account.ts` | `setPasswordWithLink` | 107 |
| `app/actions/taxes.ts` | `addTaxWatch` | 18 |
| `app/actions/taxes.ts` | `addTaxDate` | 31 |
| `app/actions/taxes.ts` | `saveDeclaration` | 44 |
| `app/actions/taxes.ts` | `saveRraPayment` | 52 |
| `app/actions/taxes.ts` | `saveMoneyReceived` | 60 |
| `app/actions/taxes.ts` | `saveRequestLink` | 68 |
| `app/actions/taxes.ts` | `stopTaxWatch` | 76 |

## Form and dialog components

Counts refer to source form declarations. Conditional and repeated fields are checked using representative browser flows.

| Component | Forms | Contains a dialog or shared dialog hook |
| --- | --- | --- |
| `components/AccountSettings.tsx` | 3 | Yes |
| `components/AppShell.tsx` | 1 | Yes |
| `components/Catalogue.tsx` | 1 | Yes |
| `components/CategoryAdmin.tsx` | 0 | Yes |
| `components/IdCorrection.tsx` | 1 | No |
| `components/Intake.tsx` | 1 | No |
| `components/LanguageSwitch.tsx` | 1 | No |
| `components/Ledger.tsx` | 0 | Yes |
| `components/PhoneCode.tsx` | 1 | No |
| `components/PublicNav.tsx` | 1 | Yes |
| `components/ReplaceTool.tsx` | 1 | No |
| `components/RequestSide.tsx` | 2 | No |
| `components/RolesMatrix.tsx` | 1 | No |
| `components/ServiceAdmin.tsx` | 0 | Yes |
| `components/SetPassword.tsx` | 1 | No |
| `components/SignIn.tsx` | 2 | No |
| `components/StaffSignIn.tsx` | 3 | No |
| `components/Track.tsx` | 1 | No |
| `components/console/AccountSecurity.tsx` | 2 | No |
| `components/console/AddClientModal.tsx` | 1 | Yes |
| `components/console/ClientDetailView.tsx` | 2 | No |
| `components/console/ConfirmDialog.tsx` | 0 | Yes |
| `components/console/DataTable.tsx` | 1 | Yes |
| `components/console/FollowUpDialog.tsx` | 0 | Yes |
| `components/console/GlobalSearch.tsx` | 0 | Yes |
| `components/console/InboxView.tsx` | 1 | No |
| `components/console/RecordPaymentModal.tsx` | 1 | Yes |
| `components/console/RequestDetailView.tsx` | 1 | No |
| `components/console/SecurityPanel.tsx` | 1 | No |
| `components/console/SidePanel.tsx` | 0 | Yes |
| `components/console/Sidebar.tsx` | 0 | Yes |
| `components/console/StaffAlerts.tsx` | 0 | Yes |
| `components/console/StageTargets.tsx` | 1 | No |
| `components/console/StepUp.tsx` | 1 | Yes |
| `components/console/TaxDiary.tsx` | 4 | No |
| `components/console/TopBar.tsx` | 1 | No |
