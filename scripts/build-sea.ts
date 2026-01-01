import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

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

async function calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

async function getExpectedChecksum(version: string, filename: string): Promise<string | null> {
    const url = `https://nodejs.org/dist/${version}/SHASUMS256.txt`;
    console.log(`   Fetching checksums from ${url}...`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`   Failed to fetch SHASUMS256.txt: ${response.statusText}`);
            return null;
        }
        const text = await response.text();
        const lines = text.split('\n');
        for (const line of lines) {
            if (line.trim().endsWith(filename)) {
                return line.split(/\s+/)[0];
            }
        }
        console.warn(`   Checksum for ${filename} not found in SHASUMS256.txt`);
    } catch (e) {
        console.warn('   Failed to fetch checksums:', e);
    }
    return null;
}

async function main() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.join(__dirname, '..');
    const distDir = path.join(projectRoot, 'dist');
    const tempDir = path.join(projectRoot, 'temp_build');
    const cacheDir = path.join(projectRoot, '.cache');

    // Ensure directories exist
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    console.log('📦 1. Bundling with esbuild...');
    execSync('npm run build:bundle', { stdio: 'inherit', cwd: projectRoot });

    console.log('🔮 2. Generating SEA blob...');
    execSync('node --experimental-sea-config sea-config.json', { stdio: 'inherit', cwd: projectRoot });

    console.log('📥 3. Fetching Node.js binary for Linux x64...');
    // Use the current running Node version to ensure blob compatibility
    const NODE_VERSION = process.version; 
    console.log(`   Targeting Node.js version: ${NODE_VERSION}`);

    const tarballFilename = `node-${NODE_VERSION}-linux-x64.tar.gz`;
    const NODE_DIST_URL = `https://nodejs.org/dist/${NODE_VERSION}/${tarballFilename}`;
    const cachedTarballPath = path.join(cacheDir, tarballFilename);
    const tempTarballPath = path.join(tempDir, 'node-linux.tar.gz');
    
    let useCached = false;
    const expectedChecksum = await getExpectedChecksum(NODE_VERSION, tarballFilename);

    if (fs.existsSync(cachedTarballPath)) {
        if (expectedChecksum) {
            console.log('   Checking cached file integrity...');
            const actualChecksum = await calculateChecksum(cachedTarballPath);
            if (actualChecksum === expectedChecksum) {
                console.log('   ✅ Cached file matches checksum. Skipping download.');
                useCached = true;
            } else {
                console.log('   ❌ Cached file checksum mismatch. Redownloading...');
            }
        } else {
            console.log('   ⚠️ No checksum found to verify. Assuming cached file is okay (or force download if you prefer safety).');
            // For safety, if we can't verify, maybe we should redownload? 
            // Or just trust it. User said "If there is one, compare MD5".
            // Let's trust it if we can't fetch checksums (maybe offline?), but warn.
            // But if we can't fetch checksums, we probably can't download either.
            useCached = true;
        }
    }

    if (!useCached) {
        console.log(`   Downloading ${NODE_DIST_URL}...`);
        try {
            await downloadFile(NODE_DIST_URL, cachedTarballPath);
            if (expectedChecksum) {
                const actualChecksum = await calculateChecksum(cachedTarballPath);
                if (actualChecksum !== expectedChecksum) {
                    throw new Error(`Downloaded file checksum mismatch! Expected: ${expectedChecksum}, Actual: ${actualChecksum}`);
                }
                console.log('   ✅ Downloaded file checksum verified.');
            }
        } catch (e) {
            console.log('   Failed to download specific version, checking internet connection or version availability.');
            throw new Error(`Failed to download Node.js ${NODE_VERSION}: ${e}`);
        }
    }

    // Copy to temp dir for extraction (to keep logic simple and safe)
    fs.copyFileSync(cachedTarballPath, tempTarballPath);

    console.log('📂 4. Extracting Node.js binary...');
    // Extract only the node binary. tar -xzf file.tar.gz -C outdir --strip-components=1 */bin/node
    // Using tar command
    try {
        execSync(`tar -xzf "${tempTarballPath}" -C "${tempDir}" --strip-components=2 "node-${NODE_VERSION}-linux-x64/bin/node"`, { stdio: 'ignore' });
    } catch (e) {
        // Fallback extraction if directory name differs
         execSync(`tar -xzf "${tempTarballPath}" -C "${tempDir}"`, { stdio: 'ignore' });
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
