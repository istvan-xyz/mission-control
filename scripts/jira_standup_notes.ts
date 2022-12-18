/**
 * JIRA_BASE_URL
 * JIRA_API_EMAIL
 * JIRA_API_TOKEN
 * USE_CLOCKIFY
 *
 * brew install lucassabreu/tap/clockify-cli
 */
import { DateTime } from 'https://raw.githubusercontent.com/ipmanlk/deno-luxon/master/mod.ts';
import { parse } from 'https://deno.land/std@0.119.0/flags/mod.ts';
import { Issue, JiraClient } from '../jira.ts';

const flags = parse(Deno.args, {
    string: ['offset'],
});

const jiraClient = new JiraClient(
    Deno.env.get('JIRA_BASE_URL') || '',
    Deno.env.get('JIRA_API_EMAIL') || '',
    Deno.env.get('JIRA_API_TOKEN') || '',
);

const baseUrl = Deno.env.get('JIRA_BASE_URL');

const issueToLog = (issue: Issue, { showCreator }: { showCreator?: boolean } = {}) =>
    ` * ${issue.fields.summary} [${issue.key}](${baseUrl}/browse/${issue.key})${
        showCreator ? ` ${issue.fields.creator.displayName}` : ''
    }${
        issue.fields.resolution?.name && issue.fields.resolution.name !== 'Done'
            ? ` *${issue.fields.resolution.name}*`
            : ''
    }`;

let lineBuffer = '';

const writeLine = (line: string) => {
    lineBuffer = `${lineBuffer}${line}\n`;
};

const printBuffer = () => {
    console.log(lineBuffer);
    lineBuffer = '';
};

const runCommand = async ({ command, args = [] }: { command: string; args: string[] }) => {
    const proc = Deno.run({ cmd: [command, ...args], stdout: 'piped', stderr: 'piped' });
    const [stderr, stdout, status] = await Promise.all([proc.stderrOutput(), proc.output(), proc.status()]);

    if (!status.success) {
        throw new Error(`Error running: ${[command, ...args].join(' ')} ${new TextDecoder().decode(stderr)}`);
    }

    return new TextDecoder().decode(stdout);
};

/**/

const extractIssueIds = (string: string) => Array.from(string.matchAll(/\[([^\]]*)\]/gm), (m) => m[1]);

const fetchIssuesWorkedOn = async () => {
    if (!Deno.env.get('USE_CLOCKIFY')) {
        return [];
    }

    // TODO: use clockify-cli report [<start>] [<end>]

    const items =
        JSON.parse(await runCommand({ command: 'clockify-cli', args: ['report', 'yesterday', '--json'] })) || [];
    return Array.from(new Set(items.flatMap((item: { description: string }) => extractIssueIds(item.description))));
};

const issuesWorkedOn = await fetchIssuesWorkedOn();
/**/

const response = await jiraClient.searchIssues(
    'assignee in (currentUser()) AND status = Done AND resolved >= -3d ORDER BY created DESC',
);

const weekendOffset = DateTime.local().weekday - 5;
const offset = DateTime.local()
    .setZone('UTC')
    .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
    .minus({ days: flags.offset ? +flags.offset : weekendOffset <= 0 ? 1 : weekendOffset });

const issuesDone = response.issues.filter((issue) => {
    const resolutionTime = DateTime.fromISO(issue.fields.resolutiondate);
    return resolutionTime > offset;
});

const issuesReviewResult = await jiraClient.searchIssues(
    'assignee in (currentUser()) AND issuetype != Epic AND status = Review ORDER BY created DESC',
);

const issuesDoingResult = await jiraClient.searchIssues(
    'assignee in (currentUser()) AND status = "In Progress" AND "Flagged[Checkboxes]" IS NULL AND issuetype != Epic ORDER BY rank ASC',
);

const blockedIssues = await jiraClient.searchIssues(
    'assignee in (currentUser()) AND "Flagged[Checkboxes]" = Impediment ORDER BY created DESC',
);

const selectForDevelopmentIssues = await jiraClient.searchIssues(
    'assignee in (currentUser()) AND status = "Selected for Development" AND "Flagged[Checkboxes]" IS NULL AND issuetype != Epic ORDER BY rank ASC',
);

const upNextIssues = issuesDoingResult.issues.filter((item) => !issuesWorkedOn.includes(item.key));

const workedOnIssues = (issuesDoingResult.issues ?? []).filter((item) => issuesWorkedOn.includes(item.key));

if (issuesDone.length) {
    writeLine('*Done ✅*');

    for (const issue of issuesDone) {
        writeLine(issueToLog(issue));
    }
}

if (issuesReviewResult.issues.length) {
    writeLine('');
    writeLine('*In review 🔬*');
    for (const issue of issuesReviewResult.issues) {
        writeLine(issueToLog(issue, { showCreator: true }));
    }
}

if (workedOnIssues.length) {
    writeLine('');
    writeLine('*Worked on ⏳*');
    for (const issue of workedOnIssues) {
        writeLine(issueToLog(issue));
    }
}

if (upNextIssues.length || selectForDevelopmentIssues.issues.length) {
    writeLine('');
    writeLine('*Up next ⏩*');
    for (const issue of upNextIssues.concat(selectForDevelopmentIssues.issues.slice(0, 3))) {
        writeLine(issueToLog(issue));
    }
}

if (blockedIssues.issues.length) {
    writeLine('');
    writeLine('*Blocked issues ❗️*');
    for (const issue of blockedIssues.issues) {
        writeLine(issueToLog(issue));
    }

    writeLine('');
}

printBuffer();
