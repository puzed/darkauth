#!/usr/bin/env tsx

import { createContext } from "../src/context/createContext.js";
import { adminUsers, clients, settings } from "../src/db/schema.js";
import { generateEdDSAKeyPair, storeKeyPair } from "../src/services/jwks.js";
import { createKekService, generateKdfParams } from "../src/services/kek.js";
import {
	isSystemInitialized,
	markSystemInitialized,
	seedDefaultSettings,
} from "../src/services/settings.js";
import type { Config } from "../src/types.js";
import { generateRandomString } from "../src/utils/crypto.js";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

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

	function loadRoot() {
		const candidates = [
			path.resolve(process.cwd(), "config.yaml"),
			path.resolve(process.cwd(), "..", "..", "config.yaml"),
		];
		for (const p of candidates) if (fs.existsSync(p)) return parse(fs.readFileSync(p, "utf8")) as any;
		return null;
	}
	const root = loadRoot();
	const config: Config = {
		postgresUri: root?.postgresUri || "postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth",
		userPort: root?.userPort || 9090,
		adminPort: root?.adminPort || 9081,
		proxyUi: !!root?.proxyUi,
		kekPassphrase: root?.kekPassphrase || "",
		isDevelopment: process.env.NODE_ENV !== "production",
		publicOrigin: `http://localhost:${root?.userPort || 9090}`,
		issuer: `http://localhost:${root?.userPort || 9090}`,
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
		let kdfParams = null;

		if (!config.kekPassphrase) {
			console.error("ERROR: KEK passphrase is required for secure operation.");
			console.error(
				"Please provide ZKAUTH_KEK_PASSPHRASE or KEK_PASSPHRASE environment variable",
			);
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
				clientId: "app-web",
				redirectUri: `${config.publicOrigin}/callback`,
			},
			value: {
				issuer: config.issuer,
				clientId: "app-web",
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
					clientId: "app-web",
					redirectUri: `${config.publicOrigin}/callback`,
				},
				value: {
					issuer: config.issuer,
					clientId: "app-web",
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
				clientId: "app-web",
				redirectUri: `http://localhost:9092/callback`,
				demoApi: `http://localhost:9094`,
			},
			value: {
				issuer: config.issuer,
				clientId: "app-web",
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
					clientId: "app-web",
					redirectUri: `http://localhost:9092/callback`,
					demoApi: `http://localhost:9094`,
				},
				value: {
					issuer: config.issuer,
					clientId: "app-web",
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
		const supportDeskClientSecret = generateRandomString(32);
		let supportDeskSecretEnc = null;

		if (kekService?.isAvailable()) {
			supportDeskSecretEnc = await kekService.encrypt(
				Buffer.from(supportDeskClientSecret),
			);
		}

		await context.db.insert(clients).values([
			{
				clientId: "app-web",
				name: "Web Application",
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
				clientId: "support-desk",
				name: "Support Desk",
				type: "confidential",
				tokenEndpointAuthMethod: "client_secret_basic",
				clientSecretEnc: supportDeskSecretEnc,
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
				grantTypes: ["authorization_code"],
				responseTypes: ["code"],
				scopes: ["openid", "profile"],
				allowedZkOrigins: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		console.log("6. Creating default admin user...");
		const adminEmail = "admin@example.com";
		const adminName = "System Administrator";

		await context.db.insert(adminUsers).values({
			email: adminEmail,
			name: adminName,
			role: "write",
			createdAt: new Date(),
		});

		console.log("7. Marking system as initialized...");
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
			"║   - app-web (public, ZK-enabled)                                 ║",
		);
		console.log(
			"║   - support-desk (confidential, standard)                        ║",
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
