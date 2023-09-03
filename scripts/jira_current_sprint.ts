#!/usr/bin/env -S -P/${HOME}/.deno/bin:/opt/homebrew/bin:/usr/local/bin deno run --allow-all
// <xbar.title>Jira current Sprint TS</xbar.title>
// <xbar.desc>Shows issues from current sprint.</xbar.desc>
// <xbar.version>v0.1</xbar.version>
// <xbar.author>István Antal</xbar.author>
// <xbar.author.github>istvan-antal</xbar.author.github>
// <xbar.dependencies>Deno</xbar.dependencies>

//  Variables
//  <xbar.var>string(JIRA_BASE_URL=""): Jira base URL.</xbar.var>
//  <xbar.var>string(JIRA_API_EMAIL=""): Jira variable.</xbar.var>
//  <xbar.var>string(JIRA_API_TOKEN=""): Jira variable.</xbar.var>

import { xbar, separator } from 'https://deno.land/x/xbar@v2.1.0/mod.ts';
import axios from 'https://deno.land/x/axiod@0.20.0-0/mod.ts';
import formatDistance from 'https://deno.land/x/date_fns@v2.22.1/formatDistance/index.ts';
import parseISO from 'https://deno.land/x/date_fns@v2.22.1/parseISO/index.js';

const runCommand = async ({ command, args = [] }: { command: string; args: string[] }) => {
    const proc = Deno.run({ cmd: [command, ...args], stdout: 'piped', stderr: 'piped' });
    const [stderr, stdout, status] = await Promise.all([proc.stderrOutput(), proc.output(), proc.status()]);

    if (!status.success) {
        throw new Error(`Error running: ${[command, ...args].join(' ')} ${new TextDecoder().decode(stderr)}`);
    }

    return new TextDecoder().decode(stdout);
};

export interface Issue {
    key: string;
    fields: {
        summary: string;
        status: {
            name: string;
        };
        assignee?: {
            displayName: string;
        };
        watches: {
            self: string;
        };
        creator: {
            displayName: string;
        };
        resolution: {
            name: string;
        };
        resolutiondate: string;
        aggregatetimeoriginalestimate: number;
        aggregatetimespent: number;
        /**
         * Flagged.
         */
        customfield_10021?: string;
    };
}

export class JiraClient {
    private readonly authHeader: string;

    constructor(private readonly baseUrl: string, email: string, apiToken: string) {
        if (!this.baseUrl) {
            throw new Error('No Base URL');
        }

        this.authHeader = `${email}:${apiToken}`;
    }

    async callJiraApi(path: string) {
        const url = `${this.baseUrl}/rest${path}`;
        const result = await runCommand({ command: 'curl', args: [url, '--user', this.authHeader] });

        return JSON.parse(result);
    }

    async searchIssues(jql: string): Promise<{
        issues: Issue[];
    }> {
        return this.callJiraApi(`/api/2/search?jql=${encodeURIComponent(jql).replaceAll('!', '%21')}`);
    }
}

const issueToUrl = (issue: Issue) =>
    issue.fields.watches.self.replace('rest/api/2/', '').replace('/watchers', '').replace('/issue/', '/browse/');

const secondsToTime = (seconds: number) => {
    const hour = Math.floor(seconds / 3600);
    let result = `${hour}h`;

    const minutes = Math.floor((seconds % 3600) / 60);

    if (minutes) {
        result = `${result} ${minutes}m`;
    }

    return result;
};

const issueToMenu = (issue: Issue) => {
    let text = `${issue.fields.summary} ${issue.key} - `;

    if (issue.fields.aggregatetimespent) {
        text = `${text} ${secondsToTime(issue.fields.aggregatetimespent)} /`;
    }

    if (issue.fields.aggregatetimeoriginalestimate) {
        text = `${text} ${secondsToTime(issue.fields.aggregatetimeoriginalestimate)}`;
    }

    if (
        issue.fields.status.name === 'Done' &&
        issue.fields.aggregatetimespent <= issue.fields.aggregatetimeoriginalestimate
    ) {
        text = `${text} 🏆`;
    }

    /*
    if (issue.fields.customfield_10021) {
        text = `${text} `;
    }
    */

    return {
        text,
        href: issueToUrl(issue),
    };
};

const jiraClient = new JiraClient(
    Deno.env.get('JIRA_BASE_URL') || '',
    Deno.env.get('JIRA_API_EMAIL') || '',
    Deno.env.get('JIRA_API_TOKEN') || '',
);

const { issues } = await jiraClient.searchIssues(
    'Sprint in openSprints() AND assignee = currentUser() AND "Flagged[Checkboxes]" IS NULL ORDER BY priority DESC, Rank ASC',
);

const inProgressIssues = issues.filter((issue) => issue.fields.status.name === 'In Progress');
const inReviewIssues = issues.filter((issue) => issue.fields.status.name === 'Review');
const issuesDone = issues.filter((issue) => issue.fields.status.name === 'Done');

const toDoIssues = issues.filter(
    (issue) => !inReviewIssues.includes(issue) && !inProgressIssues.includes(issue) && !issuesDone.includes(issue),
);

const countIndicators: string[] = [];
const menu: { text: string }[] = [];

if (toDoIssues.length) {
    countIndicators.push(`🧾${toDoIssues.length}`);

    const estimated = toDoIssues.reduce((a, b) => a + b.fields.aggregatetimeoriginalestimate, 0);

    menu.push(
        {
            text: `🧾 To Do - ${secondsToTime(estimated)}`,
        },
        {
            text: `---`,
        },
        ...toDoIssues.map(issueToMenu),
        {
            text: `---`,
        },
    );
}

if (inProgressIssues.length) {
    countIndicators.push(`⏳${inProgressIssues.length}`);

    const spent = inProgressIssues.reduce((a, b) => a + b.fields.aggregatetimespent, 0);
    const estimated = inProgressIssues.reduce((a, b) => a + b.fields.aggregatetimeoriginalestimate, 0);

    menu.push(
        {
            text: `⏳ In Progress - ${secondsToTime(spent)} / ${secondsToTime(estimated)}`,
        },
        {
            text: `---`,
        },
        ...inProgressIssues.map(issueToMenu),
        {
            text: `---`,
        },
    );
}

if (inReviewIssues.length) {
    countIndicators.push(`🔬${inReviewIssues.length}`);

    const spent = inReviewIssues.reduce((a, b) => a + b.fields.aggregatetimespent, 0);
    const estimated = inReviewIssues.reduce((a, b) => a + b.fields.aggregatetimeoriginalestimate, 0);

    menu.push(
        {
            text: `🔬 In Review - ${secondsToTime(spent)} / ${secondsToTime(estimated)}`,
        },
        {
            text: `---`,
        },
        ...inReviewIssues.map(issueToMenu),
        {
            text: `---`,
        },
    );
}

if (issuesDone.length) {
    countIndicators.push(`✅ ${issuesDone.length}`);

    const spent = issuesDone.reduce((a, b) => a + b.fields.aggregatetimespent, 0);
    const estimated = issuesDone.reduce((a, b) => a + b.fields.aggregatetimeoriginalestimate, 0);

    menu.push(
        {
            text: `✅ Done - ${secondsToTime(spent)} / ${secondsToTime(estimated)}`,
        },
        {
            text: `---`,
        },
        ...issuesDone.map(issueToMenu),
        {
            text: `---`,
        },
    );
}

xbar([
    {
        text: countIndicators.join(' / '),
    },
    separator,
    ...menu,
]);
