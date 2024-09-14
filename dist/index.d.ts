import { ResolvedConfig } from 'vite';
import type { OutputOptions } from 'rollup';
export interface Options {
    prepare?: boolean;
    destination?: string;
    enableCommitHash?: boolean;
    disableBumpSameStatus?: boolean;
}
export interface AppVersion {
    version: string;
    build_id: number;
    total_build: number;
    commit_hash?: string;
}
export interface StatusHash {
    previous?: string;
    current?: string;
}
export default function vitePluginBuildId(options?: Options): Promise<{
    name: string;
    configResolved(config: ResolvedConfig): Promise<void>;
    writeBundle(options: OutputOptions): void;
}>;
