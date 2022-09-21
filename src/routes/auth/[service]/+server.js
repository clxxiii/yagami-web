import {
	OSU_CLIENT_ID,
	OSU_CLIENT_SECRET,
	DISCORD_CLIENT_ID,
	DISCORD_CLIENT_SECRET,
	TWITCH_CLIENT_ID,
	TWITCH_CLIENT_SECRET,
} from "$env/static/private";
import prisma from "$lib/prisma";
import { redirect } from "@sveltejs/kit";

let services = {
	osu: {
		auth_url: "https://osu.ppy.sh/oauth/token",
		base_url: "https://osu.ppy.sh/api/v2",
		client_id: OSU_CLIENT_ID,
		client_secret: OSU_CLIENT_SECRET,
	},
	// OAuth URL https://discord.com/oauth2/authorize?client_id=956030276050493441&redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fauth%2Fdiscord&response_type=code&scope=identify%20guilds.join%20guilds
	discord: {
		auth_url: "https://discord.com/api/oauth2/token",
		base_url: "https://discord.com/api/v10",
		client_id: DISCORD_CLIENT_ID,
		client_secret: DISCORD_CLIENT_SECRET,
	},
	// OAuth URL https://id.twitch.tv/oauth2/authorize?client_id=3x4h9ud5bqjsh164ifxywll9wao6oe&redirect_uri=http://localhost:4000/auth/twitch&response_type=code&scope=user_read&force_verify=true
	twitch: {
		auth_url: "https://id.twitch.tv/oauth2/token",
		base_url: "https://api.twitch.tv/helix",
		client_id: TWITCH_CLIENT_ID,
		client_secret: TWITCH_CLIENT_SECRET,
	},
};

export async function GET({ url, params, cookies }) {
	let service = services[params.service];
	if (!service) {
		throw redirect(302, "/");
	}

	if (params.service == "osu") {
		let tokenRequest = {
			client_id: service.client_id,
			client_secret: service.client_secret,
			code: url.searchParams.get("code"),
			grant_type: "authorization_code",
			redirect_uri: `http://localhost:4000/auth/osu`,
		};
		let response = await fetch(service.auth_url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(tokenRequest),
		});
		response = await response.json();

		// Get user from osu API
		let reqUrl = `${service.base_url}/me`;
		let userResponse = await fetch(reqUrl, {
			headers: {
				Authorization: `Bearer ${response.access_token}`,
				Accept: "application/json",
			},
		});
		userResponse = await userResponse.json();

		let user = await prisma.user.findUnique({
			where: {
				id: userResponse.id,
			},
		});

		if (!user) {
			let { id, username, country_code, cover_url } = userResponse;
			let country_name = userResponse.country.name;
			let {
				ranked_score,
				play_count,
				total_score,
				global_rank: pp_rank,
				hit_accuracy,
				pp,
			} = userResponse.statistics;
			let { current: level, progress: level_progress } =
				userResponse.statistics.level;
			let {
				access_token,
				expires_in,
				refresh_token,
				token_type: type,
			} = response;
			user = await prisma.user.create({
				data: {
					id,
					username,
					country_code,
					country_name,
					cover_url,
					ranked_score,
					play_count,
					total_score,
					pp_rank,
					hit_accuracy,
					level,
					level_progress,
					pp,
					access_token,
					expires_in,
					refresh_token,
					type,
				},
			});
		}

		let session = await prisma.userSession.create({
			data: {
				osuId: user.id,
				id: crypto.randomUUID(),
			},
		});
		cookies.set("yagami_session", session.id, { path: "/" });
		throw redirect(302, "/close");
	}

	if (params.service == "discord") {
		// Get oAuth token
		let tokenRequest = {
			client_id: service.client_id,
			client_secret: service.client_secret,
			code: url.searchParams.get("code"),
			grant_type: "authorization_code",
			redirect_uri: `http://localhost:4000/auth/discord`,
		};

		let tokenRequestForm = new URLSearchParams(
			Object.entries(tokenRequest)
		).toString();

		let response = await fetch(service.auth_url, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/x-www-form-urlencoded",
			},
			body: tokenRequestForm,
		});
		response = await response.json();

		// Get user from discord API
		let reqUrl = `${service.base_url}/users/@me`;
		let userResponse = await fetch(reqUrl, {
			headers: {
				Authorization: `Bearer ${response.access_token}`,
			},
		});
		userResponse = await userResponse.json();

		console.log(userResponse);
	}

	if (params.service == "twitch") {
		// Get oAuth token
		let tokenRequest = {
			client_id: service.client_id,
			client_secret: service.client_secret,
			code: url.searchParams.get("code"),
			grant_type: "authorization_code",
			redirect_uri: `http://localhost:4000/auth/twitch`,
		};
		console.log(tokenRequest);
		let tokenRequestForm = new URLSearchParams(
			Object.entries(tokenRequest)
		).toString();
		console.log(tokenRequestForm);
		let response = await fetch(service.auth_url, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/x-www-form-urlencoded",
			},
			body: tokenRequestForm,
		});
		response = await response.json();
		console.log(response);

		// Get user from discord API
		let reqUrl = `${service.base_url}/users`;
		let userResponse = await fetch(reqUrl, {
			headers: {
				"Client-Id": service.client_id,
				Authorization: `Bearer ${response.access_token}`,
			},
		});
		userResponse = await userResponse.json();

		console.log(userResponse);
	}

	return new Response();
}
