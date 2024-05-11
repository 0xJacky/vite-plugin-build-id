import { ResolvedConfig, UserConfig } from 'vite';
export interface AppVersion {
    version: string;
    build_id: number;
    total_build: number;
}
export default function vitePluginBuildId(): {
    name: string;
    config(_config: UserConfig, { command }: {
        command: any;
    }): void;
    configResolved(resolvedConfig: ResolvedConfig): void;
    buildEnd(error?: Error): void;
    closeBundle(): void;
};
