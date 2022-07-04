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
    };
}

export class JiraClient {
    private readonly authHeader: string;

    constructor(private readonly baseUrl: string, email: string, apiToken: string) {
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
