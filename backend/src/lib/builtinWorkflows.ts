export const BUILTIN_WORKFLOWS: { id: string; title: string; prompt_md: string }[] = [
    {
        id: "builtin-cp-checklist",
        title: "Generate CP Checklist",
        prompt_md:
            "## Generate Conditions Precedent Checklist\n\n" +
            "Review the uploaded credit agreement or financing document and generate a comprehensive " +
            "Conditions Precedent (CP) checklist.\n\n" +
            "You MUST use the generate_docx tool to produce the checklist as a downloadable Word document. " +
            "You MUST pass landscape: true to the generate_docx tool — the document must be in landscape orientation. " +
            "Do not display the checklist inline — generate the .docx file and provide the download link.\n\n" +
            "Structure the document as follows:\n" +
            "- For each category of conditions (e.g. Corporate, Financial, Legal, Security), add a section with a heading\n" +
            "- Under each category heading, include a table with exactly these four columns in this order:\n" +
            "  1. Index — sequential number within the category (1, 2, 3…)\n" +
            "  2. Clause Number — the clause or schedule reference from the agreement\n" +
            "  3. Clause — a concise description of the condition precedent\n" +
            "  4. Status — leave blank (empty string) for the user to fill in\n\n" +
            "Use the table field in the section object (not content) for each category's rows.\n\n" +
            "Before finalizing, double-check that every table is formatted correctly: each table must have exactly the four columns above in the same order, headers must match exactly (Index, Clause Number, Clause, Status), every row must have the same number of cells as the headers, the Index column must be sequential starting from 1 within each category, and no cells should contain stray markdown, newlines, or placeholder text (use an empty string for Status).",
    },
    {
        id: "builtin-credit-summary",
        title: "Credit Agreement Summary",
        prompt_md:
            "## Credit Agreement Summary\n\n" +
            "Review the uploaded credit agreement and produce a comprehensive legal summary covering the following topics. " +
            "For each section, identify the key provisions, quote the relevant clause or schedule references, and flag any unusual, onerous, or non-market terms.\n\n" +
            "1. **Lenders** — All lenders or members of the lender syndicate, including their full legal name and role (e.g. mandated lead arranger, original lender, agent bank)\n" +
            "2. **Borrowers** — All borrowers, including their full legal name and jurisdiction of incorporation\n" +
            "3. **Guarantors** — All guarantors, including their full legal name and the scope of their guarantee obligation\n" +
            "4. **Other Parties** — Any other material parties (e.g. facility agent, security agent, hedge counterparties, issuing bank) and their roles\n" +
            "5. **Date of Agreement** — Date of the credit agreement\n" +
            "6. **Facilities** — Each facility available (e.g. Revolving Credit Facility, Term Loan A, Term Loan B, Term Loan C), the facility type, tranche name, and any key structural features\n" +
            "7. **Amount** — Total committed amount across all facilities, the currency, and breakdown by tranche if applicable\n" +
            "8. **Purpose** — Stated purpose for which borrowings may be used and any restrictions on use of proceeds\n" +
            "9. **Interest** — Applicable reference rate (e.g. SOFR, EURIBOR, base rate), the margin, any margin ratchet mechanism, and how interest periods are structured\n" +
            "10. **Commitment Fee** — Commitment or utilisation fees, the applicable rate, how they are calculated, and the basis (e.g. undrawn commitment, average utilisation)\n" +
            "11. **Repayment Schedule** — Repayment profile for each facility, whether by scheduled instalments or bullet repayment, and the repayment dates and amounts\n" +
            "12. **Maturity** — Final maturity date for each facility\n" +
            "13. **Security** — Each class of security granted or required (e.g. share pledges, fixed and floating charges, real estate mortgages, account pledges) and the assets or entities over which security is taken\n" +
            "14. **Guarantees** — Guarantee obligations, the guarantors, the scope of the guarantee, and any limitations (e.g. up-stream guarantee limitations, guarantor coverage test)\n" +
            "15. **Financial Covenants** — Each financial covenant, the metric (e.g. leverage ratio, interest cover, cashflow cover), the applicable test, testing frequency, and any equity cure rights\n" +
            "16. **Events of Default** — Each event of default, noting any grace periods, materiality thresholds, or cross-default provisions\n" +
            "17. **Assignment** — Restrictions or permissions on assignment or transfer (e.g. white/blacklists, borrower consent for lender transfers; restrictions on borrower assignment)\n" +
            "18. **Change of Control** — What constitutes a change of control, what obligations it triggers (e.g. mandatory prepayment, cancellation, lender consent), and any cure period\n" +
            "19. **Prepayment Fee** — Any prepayment fees, make-whole premiums, or soft-call protections, the applicable fee, the period during which it applies, and any exceptions (e.g. prepayment from insurance proceeds or asset disposals)\n" +
            "20. **Governing Law** — Governing law of the agreement\n" +
            "21. **Dispute Resolution** — Whether disputes go to litigation or arbitration, the chosen forum or seat, and any submission to jurisdiction provisions\n\n" +
            "Deliver the summary inline in your chat response — do NOT call generate_docx. Only produce a downloadable Word document if the user explicitly asks for one.",
    },
    {
        id: "builtin-sha-summary",
        title: "Shareholder Agreement Summary",
        prompt_md:
            "## Shareholder Agreement Summary\n\n" +
            "Review the uploaded shareholder agreement and produce a comprehensive legal summary covering the following topics. " +
            "For each section, identify the key provisions, quote the relevant clause references, and flag any unusual, onerous, or market-standard deviations.\n\n" +
            "1. **Parties & Shareholdings** — Full legal names, roles, share classes held, and percentage interests (on a fully diluted basis if stated)\n" +
            "2. **Share Classes & Rights** — For each class: voting rights, dividend rights, liquidation preference, conversion or redemption features\n" +
            "3. **Board Composition & Governance** — Board size, director appointment rights (and the shareholding thresholds required to maintain them), quorum, and casting vote\n" +
            "4. **Reserved Matters** — Decisions requiring a special majority, unanimity, or a specific shareholder's consent; note the threshold and whose consent is required for each\n" +
            "5. **Pre-emption on New Shares** — Who holds pre-emption rights, procedure, timeline, and any carve-outs (e.g. employee option schemes)\n" +
            "6. **Transfer Restrictions** — Lock-up periods, prohibited transfers, permitted transfers (e.g. to affiliates), and any board or shareholder approval requirements\n" +
            "7. **Right of First Refusal / Pre-emption on Transfer** — Trigger, procedure, pricing mechanics, and any exceptions\n" +
            "8. **Drag-Along Rights** — Who holds the right, threshold to trigger, conditions (e.g. minimum price, independent valuation), and minority protections\n" +
            "9. **Tag-Along Rights** — Who holds the right, triggering threshold, exercise procedure, and price terms\n" +
            "10. **Anti-Dilution Protections** — Type (full ratchet, weighted average), trigger events, calculation mechanics, and exceptions\n" +
            "11. **Dividend Policy** — Any obligation or target to pay dividends, preferential dividend rights, and restrictions on distributions\n" +
            "12. **Exit & Liquidity** — Agreed exit routes (trade sale, IPO, drag sale), timelines, and liquidation preferences on exit\n" +
            "13. **Deadlock** — Deadlock definition, escalation and resolution mechanisms (e.g. Russian roulette, put/call options), and consequences if unresolved\n" +
            "14. **Non-Compete & Non-Solicitation** — Who is bound, scope of activities and geography, duration, and carve-outs\n" +
            "15. **Governing Law & Dispute Resolution** — Applicable law, forum, arbitration or litigation, and any mandatory escalation steps\n\n" +
            "Generate the summary as a downloadable Word document.",
    },
    {
        id: "builtin-pk-legal-notice",
        title: "Draft Legal Notice (Pakistan)",
        prompt_md:
            "## Draft a Legal Notice\n\n" +
            "Draft a formal legal notice for service in Pakistan based on the facts the user provides (and any uploaded documents). " +
            "Ask for any essential missing facts (parties, addresses, the breach or grievance, the relief demanded, and any statutory notice period) before drafting if they are not supplied.\n\n" +
            "Structure the notice as follows:\n" +
            "- Heading: \"LEGAL NOTICE\" and, where the notice is statutory, cite the provision under which it is issued (e.g. notice under section 80 CPC to a public officer/Government, or a contractual breach notice).\n" +
            "- Through counsel block: \"THROUGH: [Advocate name], Advocate High Court\".\n" +
            "- Addressee (the noticee) with full name and address.\n" +
            "- Numbered paragraphs setting out the facts, the legal basis, and the breach or cause of action.\n" +
            "- A clear demand with a specific compliance period (e.g. 14 days).\n" +
            "- A statement that, failing compliance, the client will initiate civil and/or criminal proceedings at the noticee's risk and cost.\n" +
            "- Signature block for the issuing advocate with date and place.\n\n" +
            "Use Pakistani legal drafting conventions. Where a statutory notice period applies, state it correctly. Generate the notice as a downloadable Word document with generate_docx.",
    },
    {
        id: "builtin-pk-writ-petition",
        title: "Draft Writ Petition (Article 199)",
        prompt_md:
            "## Draft a Constitutional (Writ) Petition under Article 199\n\n" +
            "Draft a Constitutional Petition under Article 199 of the Constitution of the Islamic Republic of Pakistan, 1973, for filing before the relevant High Court, based on the user's facts and any uploaded documents.\n\n" +
            "Structure the petition as follows:\n" +
            "- Cause title: \"IN THE [LAHORE/SINDH/PESHAWAR/BALOCHISTAN/ISLAMABAD] HIGH COURT\", the writ petition number placeholder, the petitioner(s) versus the respondent(s) (impleading the relevant public functionaries/Federation/Province as appropriate).\n" +
            "- Title: \"CONSTITUTIONAL PETITION UNDER ARTICLE 199 OF THE CONSTITUTION OF THE ISLAMIC REPUBLIC OF PAKISTAN, 1973\".\n" +
            "- Numbered \"Respectfully Sheweth\" paragraphs: parties and locus standi, the impugned action/order, the relevant facts in chronological order, and the grounds (each ground lettered, e.g. (a), (b)) showing the action is without lawful authority and of no legal effect.\n" +
            "- A prayer clause setting out the specific relief sought (e.g. declaration, mandamus, certiorari, prohibition) and that no other adequate remedy is available.\n" +
            "- Verification and the advocate's signature block.\n\n" +
            "Flag the maintainability requirements (alternate remedy, locus standi) for the user. Generate the petition as a downloadable Word document with generate_docx.",
    },
    {
        id: "builtin-pk-bail-application",
        title: "Draft Bail Application",
        prompt_md:
            "## Draft a Bail Application\n\n" +
            "Draft a bail application under the Code of Criminal Procedure, 1898, based on the user's facts and any uploaded FIR or order. Confirm whether this is a pre-arrest (anticipatory) bail application under section 498 CrPC or a post-arrest bail application under section 497 CrPC, and the FIR particulars (FIR number, police station, sections, and the court), asking if not provided.\n\n" +
            "Structure the application as follows:\n" +
            "- Cause title naming the court, the case/FIR particulars, and the applicant/accused versus the State (and complainant where relevant).\n" +
            "- Title identifying it as an application under section 497 or 498 CrPC.\n" +
            "- Numbered grounds: the prosecution case in brief, then the grounds for bail (e.g. whether the offence falls within the prohibitory clause of section 497(1), absence of reasonable grounds, further inquiry, delay, malafides, medical grounds, role attributed to the accused).\n" +
            "- A prayer for grant of bail on the applicant furnishing surety to the court's satisfaction.\n" +
            "- The advocate's signature block.\n\n" +
            "Apply Pakistani criminal procedure correctly, including the distinction between bailable and non-bailable offences and the prohibitory clause. Generate the application as a downloadable Word document with generate_docx.",
    },
    {
        id: "builtin-pk-tenancy-agreement",
        title: "Draft Tenancy Agreement (Pakistan)",
        prompt_md:
            "## Draft a Tenancy (Rent) Agreement\n\n" +
            "Draft a tenancy agreement for property situated in Pakistan based on the user's instructions. Confirm the province (the applicable Rent Restriction/Tenancy law differs by province, e.g. the Punjab Rented Premises Act 2009 or the Sindh Rented Premises Ordinance 1979) and the key commercial terms before drafting.\n\n" +
            "Include, as numbered clauses beginning at the first operative clause (parties block and recitals unnumbered):\n" +
            "- Parties (landlord and tenant) with CNIC and addresses, and a description of the demised premises.\n" +
            "- Term, commencement date, and renewal mechanism.\n" +
            "- Rent, due date, mode of payment, advance/security deposit, and the annual rent increase (state the permissible percentage).\n" +
            "- Permitted use, restrictions on subletting and alterations, and utilities responsibility.\n" +
            "- Maintenance and repair obligations, and the landlord's right of inspection.\n" +
            "- Termination, notice period, and consequences of default/ejectment under the applicable rent law.\n" +
            "- Registration and stamp-duty responsibility (note the stamp duty payable under the applicable provincial Stamp Act).\n" +
            "- Governing law and dispute resolution (the Rent Controller of competent jurisdiction).\n" +
            "- An unnumbered signature block on a fresh page with witness lines (two witnesses with CNIC).\n\n" +
            "Generate the agreement as a downloadable Word document with generate_docx.",
    },
];
