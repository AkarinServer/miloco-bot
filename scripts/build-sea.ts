import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

// Helper to download file
async function downloadFile(url: string, dest: string) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText} (${response.status})`);
    }
    if (!response.body) {
        throw new Error('Response body is empty');
    }
    const fileStream = fs.createWriteStream(dest);
    await pipeline(Readable.fromWeb(response.body as any), fileStream);
}

async function main() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.join(__dirname, '..');
    const distDir = path.join(projectRoot, 'dist');
    const tempDir = path.join(projectRoot, 'temp_build');

    // Ensure dist exists
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    console.log('📦 1. Bundling with esbuild...');
    execSync('npm run build:bundle', { stdio: 'inherit', cwd: projectRoot });

    console.log('🔮 2. Generating SEA blob...');
    execSync('node --experimental-sea-config sea-config.json', { stdio: 'inherit', cwd: projectRoot });

    console.log('📥 3. Fetching Node.js binary for Linux x64...');
    // Use the current running Node version to ensure blob compatibility
    const NODE_VERSION = process.version; 
    console.log(`   Targeting Node.js version: ${NODE_VERSION}`);

    const NODE_DIST_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.gz`;
    const tarballPath = path.join(tempDir, 'node-linux.tar.gz');
    
    console.log(`   Downloading ${NODE_DIST_URL}...`);
    try {
        await downloadFile(NODE_DIST_URL, tarballPath);
    } catch (e) {
        // Fallback to nightly if v24.0.0 is not yet released (safety net)
        console.log('   Failed to download v24.0.0, trying nightly...');
        // Note: Nightly URL structure might differ, but let's try a safe assumption or just fail with instruction
        // Ideally we should use a released version. Since the user asked for Node 24, we assume it exists.
        throw new Error(`Failed to download Node.js ${NODE_VERSION}. Please check if it is released.`);
    }

    console.log('📂 4. Extracting Node.js binary...');
    // Extract only the node binary. tar -xzf file.tar.gz -C outdir --strip-components=1 */bin/node
    // Using tar command
    try {
        execSync(`tar -xzf "${tarballPath}" -C "${tempDir}" --strip-components=2 "node-${NODE_VERSION}-linux-x64/bin/node"`, { stdio: 'ignore' });
    } catch (e) {
        // Fallback extraction if directory name differs
         execSync(`tar -xzf "${tarballPath}" -C "${tempDir}"`, { stdio: 'ignore' });
         // Find node binary
         execSync(`find "${tempDir}" -name node -type f -exec cp {} "${tempDir}/node" \\;`);
    }

    const nodeBinaryPath = path.join(tempDir, 'node');
    const finalBinaryPath = path.join(distDir, 'miloco-bot-linux');

    if (!fs.existsSync(nodeBinaryPath)) {
        throw new Error('Node binary not found after extraction');
    }

    console.log('💉 5. Injecting blob into binary...');
    fs.copyFileSync(nodeBinaryPath, finalBinaryPath);

    // Using postject
    // npx postject <binary> NODE_SEA_BLOB <blob> --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    const blobPath = path.join(distDir, 'sea-prep.blob');
    execSync(`npx postject "${finalBinaryPath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`, { stdio: 'inherit' });

    console.log('✨ 6. Cleanup...');
    // fs.rmSync(tempDir, { recursive: true, force: true });
    
    console.log(`✅ Success! Binary created at: ${finalBinaryPath}`);
}

main().catch(console.error);
