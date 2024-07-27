import { UserConfig } from 'vite';
import type { OutputOptions } from 'rollup';
export interface AppVersion {
    version: string;
    build_id: number;
    total_build: number;
}
export default function vitePluginBuildId(destination?: string): {
    name: string;
    config(_config: UserConfig, { command }: {
        command: any;
    }): void;
    writeBundle(options: OutputOptions): void;
};
