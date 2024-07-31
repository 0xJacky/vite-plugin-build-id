import { ResolvedConfig } from 'vite';
import type { OutputOptions } from 'rollup';
export interface Options {
    destination?: string;
    enableCommitHash?: boolean;
    disableBumpSameStatus?: boolean;
}
export interface AppVersion {
    version: string;
    build_id: number;
    total_build: number;
    commit_hash?: string;
    status_hash?: string;
}
export default function vitePluginBuildId(options?: Options): Promise<{
    name: string;
    configResolved(config: ResolvedConfig): Promise<void>;
    writeBundle(options: OutputOptions): void;
}>;
