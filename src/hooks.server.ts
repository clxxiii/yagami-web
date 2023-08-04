import { OSU_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_OSU_CLIENT_ID } from '$env/static/public';
import prisma from '$lib/prisma';
import type { Handle, HandleFetch } from '@sveltejs/kit';
import DeviceDetector from 'node-device-detector';

const detector = new DeviceDetector();

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('yagami_session');

	if (!sessionId) return await resolve(event);

	const user = await prisma.user.findFirst({
		where: {
			Sessions: {
				some: {
					id: sessionId
				}
			}
		}
	});

	if (!user) {
		event.cookies.delete('yagami_session', { path: '/' });
		return await resolve(event);
	}

	event.locals.user = user;

	const userAgent = event.request.headers.get('user-agent') ?? '';
	const result = detector.detect(userAgent);

	await prisma.userSession.update({
		where: {
			id: sessionId
		},
		data: {
			device: result.device.type,
			browser: result.client.name,
			os: result.os.name,
			lastUsed: new Date()
		}
	});

	return await resolve(event);
};

export const handleFetch: HandleFetch = async ({ request, fetch, event }) => {
	// For osu!api requests...
	if (request.url.startsWith('https://osu.ppy.sh/api/v2/')) {
		// Retrieve session user's token
		const sessionId = event.cookies.get('yagami_session');
		const user = await prisma.user.findFirst({
			where: {
				Sessions: {
					some: {
						id: sessionId
					}
				}
			},
			include: {
				OsuToken: true
			}
		});
		console.log('Request made to osu!api: ' + request.url);

		if (user?.OsuToken) {
			let { OsuToken } = user;

			// Validate the token is still valid
			const secondsSinceLastUpdate = (new Date().valueOf() - OsuToken.last_update.valueOf()) / 1000;
			if (secondsSinceLastUpdate >= OsuToken.expires_in) {
				// The token has expired. Refresh token.
				console.log('Refreshing token (user: ' + OsuToken.userId + ')...');
				const refreshURL = new URL('https://osu.ppy.sh/oauth/token');
				refreshURL.searchParams.append('client_id', PUBLIC_OSU_CLIENT_ID);
				refreshURL.searchParams.append('client_secret', OSU_CLIENT_SECRET);
				refreshURL.searchParams.append('grant_type', 'refresh_token');
				refreshURL.searchParams.append('refresh_token', OsuToken.refresh_token);
				const refreshHeaders = {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'application/json'
				};

				let refreshResponse;
				try {
					refreshResponse = await fetch(refreshURL, {
						method: 'POST',
						headers: refreshHeaders
					});
				} catch (error) {
					console.log(error);
					throw error;
				}

				const updatedToken = await refreshResponse.json();
				// TODO: Fix 'The authorization grant type is not supported by the authorization server.' error
				/* Full erroneous response: 
				{
					error: 'unsupported_grant_type',
					error_description: 'The authorization grant type is not supported by the authorization server.',
					hint: 'Check that all required parameters have been provided',
					message: 'The authorization grant type is not supported by the authorization server.'
				} 
				*/
				// Searching for players by username in a team page/team invites section is an easy way to test.
				if (refreshResponse.ok) {
					OsuToken = await prisma.osuOauth.update({
						where: {
							userId: OsuToken.userId
						},
						data: {
							token_type: updatedToken.token_type,
							refresh_token: updatedToken.refresh_token,
							expires_in: updatedToken.expires_in,
							access_token: updatedToken.access_token,
							last_update: new Date()
						}
					});
				} else {
					console.log(
						'Something went wrong refreshing the token for user ' +
							user.username +
							' (' +
							user.username +
							'): '
					);
					console.log(updatedToken);
				}
			}

			request.headers.set('Content-Type', 'application/json');
			request.headers.set('Accept', 'application/json');
			request.headers.set('Authorization', OsuToken.token_type + ' ' + OsuToken.access_token);

			return fetch(request);
		}
	}

	return fetch(request);
};