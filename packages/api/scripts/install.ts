#!/usr/bin/env tsx

import { createContext } from "../src/context/createContext.js";
import { adminUsers, clients, settings } from "../src/db/schema.js";
import { generateEdDSAKeyPair, storeKeyPair } from "../src/services/jwks.js";
import { createKekService, generateKdfParams } from "../src/services/kek.js";
import { isSystemInitialized, markSystemInitialized, seedDefaultSettings } from "../src/services/settings.js";
import { seedDefaultGroups } from "../src/models/install.js";
import type { Config, KdfParams } from "../src/types.js";
import { generateRandomString } from "../src/utils/crypto.js";
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import readline from "node:readline";

function resolveConfigPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "config.yaml"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return path.resolve(process.cwd(), "config.yaml");
}

function readConfigFile(): any | null {
  const p = resolveConfigPath();
  if (!fs.existsSync(p)) return null;
  return parse(fs.readFileSync(p, "utf8")) as any;
}

function writeConfigFile(configuration: Record<string, unknown>): void {
  const p = resolveConfigPath();
  const out = stringify(configuration);
  fs.writeFileSync(p, out, "utf8");
}

function createPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, (a) => resolve(a)));
  const close = () => rl.close();
  return { ask, close };
}

async function install() {
	console.log(
		"╔══════════════════════════════════════════════════════════════════╗",
	);
	console.log(
		"║                    DarkAuth - Installation Script                ║",
	);
	console.log(
		"╚══════════════════════════════════════════════════════════════════╝",
	);

	const root = readConfigFile();

	const nextConfig: Record<string, unknown> = {
		...(root || {}),
		userPort: typeof root?.userPort === "number" ? root.userPort : 9080,
		adminPort: typeof root?.adminPort === "number" ? root.adminPort : 9081,
		proxyUi: typeof root?.proxyUi === "boolean" ? root.proxyUi : true,
	};

	if (!root || !root.kekPassphrase) {
		const p = createPrompt();
		const pass = await p.ask("Enter KEK passphrase: ");
		p.close();
		nextConfig.kekPassphrase = pass;
	}

	console.log("Select database option:");
	console.log("1) Remote Postgres (URI)");
	console.log("2) Embedded PGLite (directory)");
	const pDb = createPrompt();
	const dbChoice = await pDb.ask("Choice [1/2]: ");
	if (dbChoice.trim() === "2") {
		const dir = await pDb.ask("Enter PGLite data directory [./data/pglite]: ");
		nextConfig.dbMode = "pglite";
		nextConfig.pgliteDir = dir && dir.trim().length > 0 ? dir.trim() : "./data/pglite";
	} else {
		const uri = await pDb.ask("Enter Postgres URI: ");
		nextConfig.dbMode = "remote";
		nextConfig.postgresUri = uri;
	}
	pDb.close();

	writeConfigFile(nextConfig);
	const config: Config = {
		dbMode: (nextConfig.dbMode as any) || 'remote',
		pgliteDir: (nextConfig.pgliteDir as any) || undefined,
		postgresUri: (nextConfig.postgresUri as string) || "postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth",
		userPort: (nextConfig.userPort as number) || 9080,
		adminPort: (nextConfig.adminPort as number) || 9081,
		proxyUi: Boolean(nextConfig.proxyUi),
		kekPassphrase: (nextConfig.kekPassphrase as string) || "",
		isDevelopment: process.env.NODE_ENV !== "production",
		publicOrigin: `http://localhost:${(nextConfig.userPort as number) || 9080}`,
		issuer: `http://localhost:${(nextConfig.userPort as number) || 9080}`,
		rpId: "localhost",
	};

	const context = await createContext(config);

	try {
		const initialized = await isSystemInitialized(context);
		if (initialized) {
			console.log("System is already initialized. Exiting.");
			process.exit(0);
		}

		console.log("\n1. Setting up database...");

		let kekService = context.services.kek;
		let kdfParams: KdfParams;

        if (!config.kekPassphrase) {
          console.error("ERROR: KEK passphrase is required");
          process.exit(1);
        }

		console.log("2. Setting up key encryption...");
		kdfParams = generateKdfParams();
		kekService = await createKekService(config.kekPassphrase, kdfParams);

		await context.db.insert(settings).values({
			key: "kek_kdf",
			name: "KEK KDF Params",
			type: "object",
			category: "Security",
			tags: ["kek", "security"],
			defaultValue: null,
			value: kdfParams,
			secure: true,
			updatedAt: new Date(),
		});

		console.log("3. Seeding default settings...");
		await seedDefaultSettings(
			context,
			config.issuer,
			config.publicOrigin,
			config.rpId,
		);

		await context.db.insert(settings).values({
			key: "ui_user",
			name: "User UI Runtime",
			type: "object",
			category: "UI",
			tags: ["ui"],
			defaultValue: {
				issuer: config.issuer,
				clientId: "demo-public-client",
				redirectUri: `${config.publicOrigin}/callback`,
			},
			value: {
				issuer: config.issuer,
				clientId: "demo-public-client",
				redirectUri: `${config.publicOrigin}/callback`,
			},
			secure: false,
			updatedAt: new Date(),
		}).onConflictDoUpdate({
			target: settings.key,
			set: {
				name: "User UI Runtime",
				type: "object",
				category: "UI",
				tags: ["ui"],
				defaultValue: {
					issuer: config.issuer,
					clientId: "demo-public-client",
					redirectUri: `${config.publicOrigin}/callback`,
				},
				value: {
					issuer: config.issuer,
					clientId: "demo-public-client",
					redirectUri: `${config.publicOrigin}/callback`,
				},
				secure: false,
				updatedAt: new Date(),
			},
		});

		await context.db.insert(settings).values({
			key: "ui_admin",
			name: "Admin UI Runtime",
			type: "object",
			category: "UI",
			tags: ["ui"],
			defaultValue: {
				issuer: config.issuer,
				clientId: "admin-web",
				redirectUri: `http://localhost:${config.adminPort}/`,
			},
			value: {
				issuer: config.issuer,
				clientId: "admin-web",
				redirectUri: `http://localhost:${config.adminPort}/`,
			},
			secure: false,
			updatedAt: new Date(),
		}).onConflictDoUpdate({
			target: settings.key,
			set: {
				name: "Admin UI Runtime",
				type: "object",
				category: "UI",
				tags: ["ui"],
				defaultValue: {
					issuer: config.issuer,
					clientId: "admin-web",
					redirectUri: `http://localhost:${config.adminPort}/`,
				},
				value: {
					issuer: config.issuer,
					clientId: "admin-web",
					redirectUri: `http://localhost:${config.adminPort}/`,
				},
				secure: false,
				updatedAt: new Date(),
			},
		});

		await context.db.insert(settings).values({
			key: "ui_demo",
			name: "Demo UI Runtime",
			type: "object",
			category: "UI",
			tags: ["ui", "demo"],
			defaultValue: {
				issuer: config.issuer,
				clientId: "demo-public-client",
				redirectUri: `http://localhost:9092/callback`,
				demoApi: `http://localhost:9094`,
			},
			value: {
				issuer: config.issuer,
				clientId: "demo-public-client",
				redirectUri: `http://localhost:9092/callback`,
				demoApi: `http://localhost:9094`,
			},
			secure: false,
			updatedAt: new Date(),
		}).onConflictDoUpdate({
			target: settings.key,
			set: {
				name: "Demo UI Runtime",
				type: "object",
				category: "UI",
				tags: ["ui", "demo"],
				defaultValue: {
					issuer: config.issuer,
					clientId: "demo-public-client",
					redirectUri: `http://localhost:9092/callback`,
					demoApi: `http://localhost:9094`,
				},
				value: {
					issuer: config.issuer,
					clientId: "demo-public-client",
					redirectUri: `http://localhost:9092/callback`,
					demoApi: `http://localhost:9094`,
				},
				secure: false,
				updatedAt: new Date(),
			},
		});

		console.log("4. Generating signing keys...");
		const { publicJwk, privateJwk, kid } = await generateEdDSAKeyPair();

		const tempContext = {
			...context,
			services: {
				...context.services,
				kek: kekService,
			},
		};

		await storeKeyPair(tempContext, kid, publicJwk, privateJwk);

			console.log("5. Creating default clients...");
			const demoConfidentialClientSecret = generateRandomString(32);
			let demoConfidentialSecretEnc: Buffer | null = null;

			if (kekService?.isAvailable()) {
				demoConfidentialSecretEnc = await kekService.encrypt(
					Buffer.from(demoConfidentialClientSecret),
				);
			}

		await context.db.insert(clients).values([
			{
					clientId: "demo-public-client",
					name: "Demo Public Client",
				type: "public",
				tokenEndpointAuthMethod: "none",
				clientSecretEnc: null,
				requirePkce: true,
				zkDelivery: "fragment-jwe",
				zkRequired: true,
				allowedJweAlgs: ["ECDH-ES"],
				allowedJweEncs: ["A256GCM"],
				redirectUris: [
					"http://localhost:9092/",
					"http://localhost:9092/callback",
					"http://localhost:3000/",
					"http://localhost:3000/callback",
					"https://app.example.com/",
					"https://app.example.com/callback",
				],
				postLogoutRedirectUris: [
					"http://localhost:9092/",
					"http://localhost:3000",
					"https://app.example.com",
				],
				grantTypes: ["authorization_code"],
				responseTypes: ["code"],
				scopes: ["openid", "profile", "email"],
				allowedZkOrigins: [
					"http://localhost:9092",
					"http://localhost:3000",
					"https://app.example.com",
				],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
					clientId: "demo-confidential-client",
					name: "Demo Confidential Client",
				type: "confidential",
					tokenEndpointAuthMethod: "client_secret_basic",
					clientSecretEnc: demoConfidentialSecretEnc,
				requirePkce: false,
				zkDelivery: "none",
				zkRequired: false,
				allowedJweAlgs: [],
				allowedJweEncs: [],
				redirectUris: [
					"http://localhost:4000/callback",
					"https://support.example.com/callback",
				],
				postLogoutRedirectUris: [
					"http://localhost:4000",
					"https://support.example.com",
				],
					grantTypes: ["authorization_code", "refresh_token", "client_credentials"],
					responseTypes: ["code"],
					scopes: ["openid", "profile", "darkauth.users:read"],
				allowedZkOrigins: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		console.log("6. Seeding default group...");
		await seedDefaultGroups(context);

		console.log("7. Creating default admin user...");
		const adminEmail = "admin@example.com";
		const adminName = "System Administrator";

		await context.db.insert(adminUsers).values({
			email: adminEmail,
			name: adminName,
			role: "write",
			createdAt: new Date(),
		});

		console.log("8. Marking system as initialized...");
		await markSystemInitialized(context);

		console.log(
			"\n╔══════════════════════════════════════════════════════════════════╗",
		);
		console.log(
			"║                    Installation Complete!                        ║",
		);
		console.log(
			"╠══════════════════════════════════════════════════════════════════╣",
		);
		console.log(`║ Admin Email:    ${adminEmail.padEnd(49)} ║`);
		console.log(`║ Admin Name:     ${adminName.padEnd(49)} ║`);
		console.log(
			"║                                                                   ║",
		);
		console.log(
			"║ Default Clients:                                                 ║",
		);
		console.log(
			"║   - demo-public-client (public, ZK-enabled)                                 ║",
		);
		console.log(
			"║   - demo-confidential-client (confidential, standard)                        ║",
		);

		console.log(
			"║                                                                   ║",
		);
		console.log(
			"║ Security: SECURE MODE                                            ║",
		);
		console.log(
			"║ Remember to provide KEK passphrase when starting the server      ║",
		);

		console.log(
			"╚══════════════════════════════════════════════════════════════════╝",
		);

		await context.destroy();
		process.exit(0);
	} catch (error) {
		console.error("\nInstallation failed:", error);
		await context.destroy();
		process.exit(1);
	}
}

install().catch(console.error);
