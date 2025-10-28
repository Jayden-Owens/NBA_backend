const calculatePace = (team) => {
  const {
    FieldGoalsAttempted,
    FreeThrowsAttempted,
    OffensiveRebounds,
    Turnovers,
    Games,
  } = team;
  return (
    (FieldGoalsAttempted +
      0.44 * FreeThrowsAttempted -
      OffensiveRebounds +
      Turnovers) /
    2 /
    Games
  );
};

const calculatePaceAdjustedProjection = (player, teamStats) => {
  const playerTeamStats = teamStats.find(
    (team) => team.Team === player.Team,
  );
  const opponentTeamStats = teamStats.find(
    (team) => team.Team === player.Opponent,
  );

  if (!playerTeamStats || !opponentTeamStats)
    return player.ProjectedFantasyPoints;

  const playerTeamPace = +calculatePace(playerTeamStats);
  const opponentTeamPace = +calculatePace(opponentTeamStats);

  const avgPace = (playerTeamPace + opponentTeamPace) / 2;
  const paceDifferential = +avgPace - playerTeamPace;
  const extraPossessionsPerMinute = +paceDifferential / 48;
  const extraPossessions =
    +extraPossessionsPerMinute * +player.ProjectedMinutes;

  let paceAdjustedFantasyPoints =
    +player.ProjectedFantasyPoints +
    +extraPossessions * (+player.AvgFPPM / 2.125);

  paceAdjustedFantasyPoints = isNaN(paceAdjustedFantasyPoints)
    ? 0.0
    : paceAdjustedFantasyPoints;

  return paceAdjustedFantasyPoints.toFixed(3);
};

export async function processPlayerAverageData(email, name, current_season) {
    console.log('started processing for');
    //trial check
    //const subscribed = res.locals.subscribed;
    //const subscribed = true;
    //const remainingTrialDays = res.locals.remainingTrialDays;
    console.log("1");
    const date = new Date();
    const curYear = date.getFullYear();
    const curMonth = date.getMonth() + 1;
    const year = current_season;
    //const formattedDate = `${curYear}-${date.getMonth()}-${String(date.getDate()).padStart(2, '0')}`;
    const formattedDate = `${curYear}-${curMonth}-${String(date.getDate()).padStart(2, '0')}`;
    console.log("Formatted Date:", formattedDate);
    const url4 = `https://api.sportsdata.io/v3/nba/projections/json/PlayerGameProjectionStatsByDate/${formattedDate}?key=0224aa9e70ad409b99dd353a27fccdae`;

    //scheduled match for tonight with players
    const url5 = `https://api.sportsdata.io/v3/nba/projections/json/DfsSlatesByDate/${formattedDate}?key=0224aa9e70ad409b99dd353a27fccdae`;

    //const seasonInfo = 

    const url6 = `https://api.sportsdata.io/v3/nba/scores/json/TeamSeasonStats/${year}?key=0224aa9e70ad409b99dd353a27fccdae`;
     console.log("2");
    const [response, response5, teamStats] = await Promise.all([
        axios.get(url4),//, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } }),
        axios.get(url5), //, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } }),
        axios.get(url6,) //{ headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } }),
    ]);

    if (response.status !== 200 || response5.status !== 200) {
        console.error('Error fetching data from API'+response.status+response5.status);
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log('fetched all data');
    const playerMetaMap = new Map();
    response5.data.forEach(slate => {
        slate.DfsSlatePlayers.forEach(player => {
            playerMetaMap.set(player.PlayerID, {
                salary: player.OperatorSalary,
                position: player.OperatorPosition
            });
        });
    });

    let players = [];
    let ID = 0;
     console.log("3");
    for (const data of response.data) {
        const meta = playerMetaMap.get(data.PlayerID) || {};
        const DKSalary = meta.salary || 0;
        const Position = meta.position || 'NaN';

        // Run all aggregations in parallel
        const [
            home_sum,
            away_sum,
            last5_sum,
            opponent_sum
        ] = await Promise.all([
            Player.aggregate([
                { $match: { PlayerID: data.PlayerID, HomeOrAway: 'HOME' } },
                { $group: { _id: null, FantasyPoints: { $sum: '$FantasyPoints' }, Minutes: { $sum: '$Minutes' }, Seconds: { $sum: '$Seconds' } } }
            ]),
            Player.aggregate([
                { $match: { PlayerID: data.PlayerID, HomeOrAway: 'AWAY' } },
                { $group: { _id: null, FantasyPoints: { $sum: '$FantasyPoints' }, Minutes: { $sum: '$Minutes' }, Seconds: { $sum: '$Seconds' } } }
            ]),
            Player.aggregate([
                { $match: { PlayerID: data.PlayerID } },
                { $sort: { date: -1 } },
                { $limit: 5 },
                { $group: { _id: null, FantasyPoints: { $sum: '$FantasyPoints' }, Minutes: { $sum: '$Minutes' }, Seconds: { $sum: '$Seconds' } } }
            ]),
            Player.aggregate([
                { $match: { PlayerID: data.PlayerID, OpponentID: data.OpponentID } },
                { $group: { _id: null, FantasyPoints: { $sum: '$FantasyPoints' }, Minutes: { $sum: '$Minutes' }, Seconds: { $sum: '$Seconds' } } }
            ])
        ]);

        // Compute averages
        const calcFPPM = (sum) =>
            sum[0] ? sum[0].FantasyPoints / (sum[0].Minutes + sum[0].Seconds / 60) : 0;

        const AvgFPPMHome = calcFPPM(home_sum);
        const AvgFPPMAway = calcFPPM(away_sum);
        const AvgFPPMLast5 = calcFPPM(last5_sum);
        const AvgFPPMOpponent = calcFPPM(opponent_sum);

        const AvgFPPM = (home_sum[0] && away_sum[0])
            ? (home_sum[0].FantasyPoints + away_sum[0].FantasyPoints) /
            (home_sum[0].Minutes + home_sum[0].Seconds / 60 + away_sum[0].Minutes + away_sum[0].Seconds / 60)
            : (home_sum[0] ? AvgFPPMHome : AvgFPPMAway);

        const SDProjectedFPPM = data.FantasyPoints / (data.Minutes + data.Seconds / 60);
        const ProjectedMinutes = data.Minutes + data.Seconds / 60;

        // Weighted projection
        let count_number = 5;
        const weights = [AvgFPPM, AvgFPPMHome, AvgFPPMAway, AvgFPPMLast5, AvgFPPMOpponent, SDProjectedFPPM];
        weights.forEach(val => {
            if (val === 0 || isNaN(val)) count_number--;
        });
        if (count_number <= 0) count_number = 1;

        const projectionSum = weights.reduce((acc, val) => acc + (isNaN(val) ? 0 : val), 0);
        const ProjectedFantasyPoints = (projectionSum / count_number) * ProjectedMinutes;

        const player = {
            ID: ++ID,
            Name: data.Name,
            Position,
            Team: data.Team,
            Opponent: data.Opponent,
            ProjectedMinutes: ProjectedMinutes.toFixed(3),
            ProjectedFantasyPoints: ProjectedFantasyPoints.toFixed(3),
            DKSalary,
            HomeOrAway: data.HomeOrAway,
            AvgFPPM: AvgFPPM.toFixed(3),
            AvgFPPMHome: AvgFPPMHome.toFixed(3),
            AvgFPPMAway: AvgFPPMAway.toFixed(3),
            AvgFPPMLast5: AvgFPPMLast5.toFixed(3),
            AvgFPPMOpponent: AvgFPPMOpponent.toFixed(3),
            SDProjectedFPPM: SDProjectedFPPM.toFixed(3),
            FantasyValue: ((ProjectedFantasyPoints / DKSalary) * 1000).toFixed(3),
            TeamID: data.TeamID,
            OpponentID: data.OpponentID,
            PlayerID: data.PlayerID,
        };

        const paceAdjustedProjection = calculatePaceAdjustedProjection(player, teamStats.data);
        player.FantasyValue = ((paceAdjustedProjection / DKSalary) * 1000).toFixed(3);
        player.PaceAdjustedProtection = paceAdjustedProjection;

        players.push(player);
    }
    console.log('finished processing');
    return players;
}

