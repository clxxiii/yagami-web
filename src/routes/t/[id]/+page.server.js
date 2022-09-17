import prisma from "$lib/prisma";
import { error } from "@sveltejs/kit";

// export const prerender = true;

export async function load({ params }) {
	let tournamentId = parseInt(params.id);

	if (!tournamentId) {
		throw error(404, "Not found");
	}

	let tournament = await prisma.tournament.findUnique({
		where: {
			id: tournamentId,
		},
	});

	if (!tournament) {
		throw error(404, "Not found");
	}

	let rounds = await prisma.round.findMany({
		where: {
			tournamentId: tournament.id,
		},
	});

	if (rounds.length > 0) {
		for (let i = 0; i < rounds.length; i++) {
			let round = rounds[i];

			let pool = await prisma.mappool.findUnique({
				where: {
					id: round.mappoolId,
				},
			});

			if (pool) {
				let maps = await prisma.mapInPool.findMany({
					where: {
						mappoolId: pool.id,
					},
					orderBy: {
						modPriority: "asc",
					},
				});

				for (let j = 0; j < maps.length; j++) {
					let map = await prisma.map.findUnique({
						where: {
							beatmap_id: maps[j].mapId,
						},
					});

					maps[j].map = map;
				}
				pool.maps = maps;
				rounds[i].mappool = pool;
			}
		}
	}

	let teams = await prisma.team.findMany({
		where: {
			tournamentId: tournament.id,
		},
	});
	if (teams.length > 0) {
		for (let i = 0; i < teams.length; i++) {
			let team = teams[i];

			let usersInTeam = await prisma.userInTeam.findMany({
				where: {
					teamId: team.id,
				},
				orderBy: {
					member_order: "asc",
				},
			});
			for (let j = 0; j < usersInTeam.length; j++) {
				let player = usersInTeam[j];

				let user = await prisma.user.findUnique({
					where: {
						discord_id: player.discordId,
					},
				});

				player.user = user;
				usersInTeam[j] = player;
			}

			teams[i].members = usersInTeam;
		}

		// Sort teams by average rank
		teams.sort((a, b) => {
			let aAvg = 0;
			let bAvg = 0;

			for (let i = 0; i < a.members.length; i++) {
				let user = a.members[i].user;
				if (user.osu_pp_rank) {
					aAvg += user.osu_pp_rank;
				}
			}

			for (let i = 0; i < b.members.length; i++) {
				let user = b.members[i].user;
				if (user.osu_pp_rank) {
					bAvg += user.osu_pp_rank;
				}
			}

			aAvg /= a.members.length;
			bAvg /= b.members.length;

			a.avgRank = aAvg;
			b.avgRank = bAvg;
			return aAvg - bAvg;
		});
	}
	return { tournament, rounds, teams };
}
