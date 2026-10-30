# Page design review

The visual direction uses the user’s preferred navy blue (#142850). The redesign includes structural dashboard and workspace changes, not only a palette change.

The table below maps every inventoried page template to the treatment it receives. Dynamic pages share layouts; browser evidence uses representative records. Redirect-only entry points inherit their destination. Staff password/claim screens are also reviewed in expired or missing-link states; the workflow suite covers authenticated journeys.

| Page template | Design treatment |
| --- | --- |
| `/about` | Editorial heading and readable section layout |
| `/admin/audit` | Workspace heading, panels, table or record layout, and responsive controls |
| `/admin/categories` | Workspace heading, panels, table or record layout, and responsive controls |
| `/admin/content/[kind]/[id]` | Page hierarchy, editor surfaces, controls and responsive spacing |
| `/admin/content` | Page hierarchy, editor surfaces, controls and responsive spacing |
| `/admin/content/replace` | Page hierarchy, editor surfaces, controls and responsive spacing |
| `/admin/payments` | Workspace heading, panels, table or record layout, and responsive controls |
| `/admin/roles` | Workspace heading, panels, table or record layout, and responsive controls |
| `/admin/services` | Workspace heading, panels, table or record layout, and responsive controls |
| `/admin/system` | Workspace heading, panels, table or record layout, and responsive controls |
| `/console/clients/[id]` | Record header, progress, action hierarchy and supporting panels |
| `/console/clients` | Workspace heading, panels, table or record layout, and responsive controls |
| `/console/identity` | Workspace heading, panels, table or record layout, and responsive controls |
| `/console/inbox` | Workspace heading, panels, table or record layout, and responsive controls |
| `/console/intake` | Workspace heading, panels, table or record layout, and responsive controls |
| `/console/my-day` | Recomposed dashboard heading, metrics, navigation and work panels |
| `/console/overview` | Recomposed dashboard heading, metrics, navigation and work panels |
| `/console` | Shared navigation and entry layout |
| `/console/requests/[ref]` | Record header, progress, action hierarchy and supporting panels |
| `/console/requests/[ref]/receipt` | Readable document layout and print controls; restrained receipt formatting retained |
| `/console/requests` | Workspace heading, panels, table or record layout, and responsive controls |
| `/console/security` | Settings hierarchy, form surfaces and responsive layout |
| `/console/taxes` | Workspace heading, panels, table or record layout, and responsive controls |
| `/` | New city-photo hero composition, service categories, price cards and shared navigation |
| `/portal/account` | Settings hierarchy, form surfaces and responsive layout |
| `/portal/documents` | Grouped document workspace, document rows and upload panel |
| `/portal` | Recomposed dashboard heading, metrics, navigation and work panels |
| `/portal/requests/[ref]` | Record header, progress, action hierarchy and supporting panels |
| `/portal/requests/[ref]/pay` | Order summary, payment form, explicit availability/test states and confirmation before action |
| `/portal/requests/[ref]/receipt` | Readable document layout and print controls; restrained receipt formatting retained |
| `/portal/requests` | Workspace heading, panels, table or record layout, and responsive controls |
| `/privacy` | Editorial heading and readable section layout |
| `/r/[ref]` | Record header, progress, action hierarchy and supporting panels |
| `/r/[ref]/pay` | Workspace heading, panels, table or record layout, and responsive controls |
| `/r/[ref]/receipt` | Readable document layout and print controls; restrained receipt formatting retained |
| `/r/[ref]/save` | Authentication/support panel, input hierarchy and recovery states |
| `/services/[slug]` | Catalogue cards, service header and price/action hierarchy |
| `/services` | Catalogue cards, service header and price/action hierarchy |
| `/sign-in` | Authentication/support panel, input hierarchy and recovery states |
| `/staff` | Authentication/support panel, input hierarchy and recovery states |
| `/staff/set-password` | Authentication/support panel, input hierarchy and recovery states |
| `/staff/unlock` | Authentication/support panel, input hierarchy and recovery states |
| `/start/[slug]` | Application form, steps, choices and fee summary |
| `/start` | Application form, steps, choices and fee summary |
| `/terms` | Editorial heading and readable section layout |
| `/track` | Authentication/support panel, input hierarchy and recovery states |

Receipts retain their plain document layout for printing. Real-money collection stays disabled outside explicitly labeled demo tests. External production configuration, real devices and a screen-reader session remain separate launch requirements.

## Browser coverage

The blue build passed 240 combinations across 48 destinations at 360, 390, 768, 1024 and 1440 pixels. All reviewed pages had one main landmark, named controls, correct authenticated destinations and no root overflow or browser exceptions. Additional checks passed for readable narrow-screen record cards, payment confirmation order, role persistence, dialog focus and network-failure recovery. Desktop and mobile screenshots were captured for every destination.

The expanded accessibility pass passed 63 cases. Cancellation also passed a focused browser check and a 46-check dependent checkout/privacy regression after fixing closed-request payment entry. See [Production readiness](PRODUCTION_READINESS.md) for the full workflow rerun’s initial failure and subsequent verification.
