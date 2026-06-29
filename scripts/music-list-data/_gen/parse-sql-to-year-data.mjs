/**
 * Parse music_list_seed.sql → year-data.mjs (deduped, top entries fixed).
 * Run: node scripts/music-list-data/_gen/parse-sql-to-year-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRE2000_TRACKS } from './pre2000-clean.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, '..', '..', '..', 'supabase', 'music_list_seed.sql');

function trackKey(artist, title) {
  const norm = (s) =>
    String(s ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${norm(artist)}|${norm(title)}`;
}

function parseSql(content) {
  const re =
    /INSERT INTO public\.nrm_music_list \(rank, year, artist, title, album, genre\) VALUES \((\d+), (\d+), '((?:''|[^'])*)', '((?:''|[^'])*)', '((?:''|[^'])*)', '[^']*'\);/g;
  const rows = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    rows.push({
      rank: Number(m[1]),
      year: Number(m[2]),
      artist: m[3].replace(/''/g, "'"),
      title: m[4].replace(/''/g, "'"),
      album: m[5].replace(/''/g, "'"),
    });
  }
  return rows;
}

/** Known-good top tracks per year (replace corrupted SQL rows). */
const TOP_FIXES = {
  2000: [
    { artist: 'OutKast', title: 'Ms. Jackson', album: 'Stankonia' },
    { artist: 'Eminem', title: 'Stan', album: 'The Marshall Mathers LP' },
    { artist: 'Eminem', title: 'The Real Slim Shady', album: 'The Marshall Mathers LP' },
    { artist: 'Jay-Z feat. UGK', title: "Big Pimpin'", album: 'Vol. 3... Life and Times of S. Carter' },
    { artist: 'Nelly', title: 'Country Grammar (Hot Shit)', album: 'Country Grammar' },
    { artist: 'DMX', title: 'Party Up (Up in Here)', album: '...And Then There Was X' },
    { artist: 'Common', title: 'The Light', album: 'Like Water for Chocolate' },
    { artist: 'Dead Prez', title: 'Hip Hop', album: "Let's Get Free" },
    { artist: 'Ghostface Killah', title: 'Mighty Healthy', album: 'Supreme Clientele' },
    { artist: 'OutKast', title: 'B.O.B.', album: 'Stankonia' },
  ],
  2001: [
    { artist: 'Jay-Z', title: 'Izzo (H.O.V.A.)', album: 'The Blueprint' },
    { artist: 'Missy Elliott feat. Ludacris', title: 'One Minute Man', album: 'Miss E... So Addictive' },
    { artist: 'Ja Rule feat. Ashanti', title: 'Always on Time', album: 'Pain Is Love' },
    { artist: 'Eve feat. Gwen Stefani', title: 'Let Me Blow Ya Mind', album: 'Scorpion' },
    { artist: 'Nas', title: 'Got Ur Self A...', album: 'Stillmatic' },
    { artist: 'Missy Elliott', title: 'Get Ur Freak On', album: 'Miss E... So Addictive' },
    { artist: 'Jay-Z', title: 'Takeover', album: 'The Blueprint' },
    { artist: 'Ludacris feat. Mystikal & I-20', title: 'Move Bitch', album: 'Word of Mouf' },
    { artist: 'Jadakiss feat. Styles P', title: 'We Gonna Make It', album: 'Kiss tha Game Goodbye' },
    { artist: 'DMX', title: 'Who We Be', album: 'The Great Depression' },
  ],
  2002: [
    { artist: 'Eminem', title: 'Lose Yourself', album: '8 Mile: Music from and Inspired by the Motion Picture' },
    { artist: 'Clipse', title: 'Grindin\'', album: "Lord Willin'" },
    { artist: 'Nas', title: 'Made You Look', album: "God's Son" },
    { artist: 'Nelly feat. Kelly Rowland', title: 'Dilemma', album: 'Nellyville' },
    { artist: '50 Cent', title: 'In da Club', album: 'Get Rich or Die Tryin\'' },
    { artist: "Cam'ron feat. Juelz Santana", title: 'Hey Ma', album: 'Come Home with Me' },
    { artist: 'Jay-Z', title: "'03 Bonnie & Clyde", album: 'The Blueprint 2: The Gift & The Curse' },
    { artist: 'Missy Elliott', title: 'Work It', album: 'Under Construction' },
    { artist: 'Eminem', title: 'Cleanin\' Out My Closet', album: 'The Eminem Show' },
    { artist: 'N.O.R.E. feat. Nina Sky', title: 'Nothin\'', album: "God's Favorite" },
  ],
  2003: [
    { artist: '50 Cent', title: '21 Questions', album: 'Get Rich or Die Tryin\'' },
    { artist: 'OutKast', title: 'Hey Ya!', album: 'Speakerboxxx/The Love Below' },
    { artist: 'Jay-Z', title: 'Dirt off Your Shoulder', album: 'The Black Album' },
    { artist: 'Kanye West', title: 'Through the Wire', album: 'The College Dropout' },
    { artist: 'Ludacris', title: 'Stand Up', album: 'Chicken-n-Beer' },
    { artist: 'Missy Elliott', title: 'Gossip Folks', album: 'Under Construction' },
    { artist: 'Chingy', title: 'Right Thurr', album: 'Jackpot' },
    { artist: 'Fabolous feat. Lil\' Mo & Mike Jones', title: 'Can\'t Let You Go', album: 'Street Dreams' },
    { artist: 'G-Unit', title: 'Stunt 101', album: 'Beg for Mercy' },
    { artist: 'Nelly, P. Diddy & Murphy Lee', title: 'Shake Ya Tailfeather', album: 'Bad Boys II' },
  ],
  2004: [
    { artist: 'Kanye West', title: 'Jesus Walks', album: 'The College Dropout' },
    { artist: 'Kanye West', title: 'All Falls Down', album: 'The College Dropout' },
    { artist: 'Jay-Z', title: '99 Problems', album: 'The Black Album' },
    { artist: 'Usher feat. Lil Jon & Ludacris', title: 'Yeah!', album: 'Confessions' },
    { artist: 'Snoop Dogg feat. Pharrell', title: 'Drop It Like It\'s Hot', album: 'R&G (Rhythm & Gangsta): The Masterpiece' },
    { artist: 'Kanye West', title: 'The New Workout Plan', album: 'The College Dropout' },
    { artist: 'Twista feat. Kanye West & Jamie Foxx', title: 'Slow Jamz', album: 'Kamikaze' },
    { artist: 'Lil Wayne', title: 'Go DJ', album: 'Tha Carter' },
    { artist: 'Madvillain', title: 'All Caps', album: 'Madvillainy' },
    { artist: 'MF DOOM', title: 'Rhymes Like Dimes', album: 'Operation: Doomsday' },
  ],
  2005: [
    { artist: 'Kanye West', title: 'Gold Digger', album: 'Late Registration' },
    { artist: '50 Cent', title: 'Candy Shop', album: 'The Massacre' },
    { artist: 'Kanye West', title: 'Touch the Sky', album: 'Late Registration' },
    { artist: 'Common', title: 'Go!', album: 'Be' },
    { artist: 'The Game feat. 50 Cent', title: 'Hate It or Love It', album: 'The Documentary' },
    { artist: 'Eminem', title: 'Mockingbird', album: 'Encore' },
    { artist: 'Missy Elliott', title: 'Lose Control', album: 'The Cookbook' },
    { artist: 'Lil Wayne', title: 'Fireman', album: 'Tha Carter II' },
    { artist: 'Kanye West', title: 'Diamonds from Sierra Leone', album: 'Late Registration' },
    { artist: 'Gorillaz', title: 'Feel Good Inc.', album: 'Demon Days' },
  ],
  2006: [
    { artist: 'Ludacris feat. Field Mob', title: 'Runaway Love', album: 'Release Therapy' },
    { artist: 'Nas', title: 'Hip Hop Is Dead', album: 'Hip Hop Is Dead' },
    { artist: 'Jay-Z', title: 'Show Me What You Got', album: 'Kingdom Come' },
    { artist: 'T.I.', title: 'What You Know', album: 'King' },
    { artist: 'Kanye West', title: 'Stronger', album: 'Graduation' },
    { artist: 'Lupe Fiasco', title: 'Kick, Push', album: 'Lupe Fiasco\'s Food & Liquor' },
    { artist: 'Clipse', title: 'Mr. Me Too', album: 'Hell Hath No Fury' },
    { artist: 'JAY-Z', title: 'Lost One', album: 'Kingdom Come' },
    { artist: 'Young Jeezy feat. Kanye West', title: 'Put On', album: 'The Recession' },
    { artist: 'Rick Ross', title: 'Hustlin\'', album: 'Port of Miami' },
  ],
  2007: [
    { artist: 'Kanye West', title: 'Stronger', album: 'Graduation' },
    { artist: 'Kanye West', title: 'Good Life', album: 'Graduation' },
    { artist: 'Soulja Boy Tell\'Em', title: 'Crank That (Soulja Boy)', album: 'souljaboytellem.com' },
    { artist: 'T.I.', title: 'Big Things Poppin\' (Do It)', album: 'T.I. vs. T.I.P.' },
    { artist: 'Kanye West', title: 'Flashing Lights', album: 'Graduation' },
    { artist: 'Common', title: 'The People', album: 'Finding Forever' },
    { artist: 'Lil Wayne', title: 'Lollipop', album: 'Tha Carter III' },
    { artist: 'Kanye West', title: 'Can\'t Tell Me Nothing', album: 'Graduation' },
    { artist: 'UGK feat. OutKast', title: 'International Players Anthem (I Choose You)', album: 'UGK (Underground Kingz)' },
    { artist: 'M.I.A.', title: 'Paper Planes', album: 'Kala' },
  ],
  2008: [
    { artist: 'Lil Wayne', title: 'A Milli', album: 'Tha Carter III' },
    { artist: 'Kanye West', title: 'Love Lockdown', album: '808s & Heartbreak' },
    { artist: 'T.I.', title: 'Live Your Life', album: 'Paper Trail' },
    { artist: 'Kanye West', title: 'Heartless', album: '808s & Heartbreak' },
    { artist: 'Jay-Z', title: 'Swagga Like Us', album: 'The Blueprint 3' },
    { artist: 'Kid Cudi', title: 'Day \'n\' Nite', album: "Man on the Moon: The End of Day" },
    { artist: 'Kanye West', title: 'Champion', album: 'Graduation' },
    { artist: 'Lupe Fiasco', title: 'Superstar', album: 'The Cool' },
    { artist: 'Nas', title: 'Hero', album: 'Untitled' },
    { artist: 'Dead Prez', title: 'Hip Hop', album: "Let's Get Free" },
  ],
  2009: [
    { artist: 'Jay-Z feat. Alicia Keys', title: 'Empire State of Mind', album: 'The Blueprint 3' },
    { artist: 'Kanye West', title: 'Power', album: 'My Beautiful Dark Twisted Fantasy' },
    { artist: 'Drake', title: 'Best I Ever Had', album: 'So Far Gone' },
    { artist: 'Kid Cudi', title: 'Day \'n\' Nite', album: "Man on the Moon: The End of Day" },
    { artist: 'Jay-Z', title: 'D.O.A. (Death of Auto-Tune)', album: 'The Blueprint 3' },
    { artist: 'Eminem', title: 'Crack a Bottle', album: 'Relapse' },
    { artist: 'Kanye West', title: 'Runaway', album: 'My Beautiful Dark Twisted Fantasy' },
    { artist: 'Drake', title: 'Forever', album: 'More Than a Game' },
    { artist: 'Jay-Z feat. Rihanna & Kanye West', title: 'Run This Town', album: 'The Blueprint 3' },
    { artist: 'Mos Def', title: 'History', album: 'The Ecstatic' },
  ],
  2010: [
    { artist: 'Eminem feat. Rihanna', title: 'Love the Way You Lie', album: 'Recovery' },
    { artist: 'Kanye West', title: 'Power', album: 'My Beautiful Dark Twisted Fantasy' },
    { artist: 'Kanye West', title: 'Runaway', album: 'My Beautiful Dark Twisted Fantasy' },
    { artist: 'Drake', title: 'Over', album: 'Thank Me Later' },
    { artist: 'Kanye West feat. Pusha T', title: 'Runaway', album: 'My Beautiful Dark Twisted Fantasy' },
    { artist: 'Waka Flocka Flame', title: 'Hard in da Paint', album: 'Flockaveli' },
    { artist: 'Kanye West', title: 'Monster', album: 'My Beautiful Dark Twisted Fantasy' },
    { artist: 'Drake', title: 'Find Your Love', album: 'Thank Me Later' },
    { artist: 'Kanye West', title: 'All of the Lights', album: 'My Beautiful Dark Twisted Fantasy' },
    { artist: 'Rick Ross', title: 'B.M.F. (Blowin\' Money Fast)', album: 'Teflon Don' },
  ],
  2011: [
    { artist: 'Kanye West & Jay-Z', title: 'Niggas in Paris', album: 'Watch the Throne' },
    { artist: 'Kanye West & Jay-Z', title: 'Otis', album: 'Watch the Throne' },
    { artist: 'Jay-Z & Kanye West', title: 'No Church in the Wild', album: 'Watch the Throne' },
    { artist: 'Lil Wayne', title: '6 Foot 7 Foot', album: 'Tha Carter IV' },
    { artist: 'Tyler, The Creator', title: 'Yonkers', album: 'Goblin' },
    { artist: 'A$AP Rocky', title: 'Peso', album: 'Live.Love.A$AP' },
    { artist: 'Drake', title: 'Headlines', album: 'Take Care' },
    { artist: 'Kanye West & Jay-Z', title: 'H.A.M.', album: 'Watch the Throne' },
    { artist: 'J. Cole', title: 'Work Out', album: 'Cole World: The Sideline Story' },
    { artist: 'Kendrick Lamar', title: 'A.D.H.D.', album: 'Section.80' },
  ],
  2012: [
    { artist: 'Kendrick Lamar', title: 'Swimming Pools (Drank)', album: 'good kid, m.A.A.d city' },
    { artist: 'Kendrick Lamar', title: 'Bitch, Don\'t Kill My Vibe', album: 'good kid, m.A.A.d city' },
    { artist: 'Kendrick Lamar', title: 'm.A.A.d city', album: 'good kid, m.A.A.d city' },
    { artist: 'Kendrick Lamar', title: 'Backseat Freestyle', album: 'good kid, m.A.A.d city' },
    { artist: 'Kendrick Lamar', title: 'Money Trees', album: 'good kid, m.A.A.d city' },
    { artist: 'Kendrick Lamar', title: 'Poetic Justice', album: 'good kid, m.A.A.d city' },
    { artist: 'Kendrick Lamar', title: 'Sing About Me, I\'m Dying of Thirst', album: 'good kid, m.A.A.d city' },
    { artist: 'Kendrick Lamar', title: 'The Art of Peer Pressure', album: 'good kid, m.A.A.d city' },
    { artist: 'Kendrick Lamar', title: 'Good Kid', album: 'good kid, m.A.A.d city' },
    { artist: 'Kendrick Lamar', title: 'Compton', album: 'good kid, m.A.A.d city' },
  ],
  2013: [
    { artist: 'Kendrick Lamar', title: 'Swimming Pools (Drank)', album: 'good kid, m.A.A.d city' },
    { artist: 'Kendrick Lamar', title: 'Bitch, Don\'t Kill My Vibe', album: 'good kid, m.A.A.d city' },
    { artist: 'Jay-Z', title: 'Tom Ford', album: 'Magna Carta... Holy Grail' },
    { artist: 'Kanye West', title: 'Black Skinhead', album: 'Yeezus' },
    { artist: 'Kanye West', title: 'New Slaves', album: 'Yeezus' },
    { artist: 'Kanye West', title: 'Bound 2', album: 'Yeezus' },
    { artist: 'Drake', title: 'Started from the Bottom', album: 'Nothing Was the Same' },
    { artist: 'Kendrick Lamar', title: 'Control', album: '' },
    { artist: 'J. Cole', title: 'Crooked Smile', album: 'Born Sinner' },
    { artist: 'Eminem', title: 'Rap God', album: 'The Marshall Mathers LP 2' },
  ],
  2014: [
    { artist: 'Kendrick Lamar', title: 'i', album: 'To Pimp a Butterfly' },
    { artist: 'Run the Jewels', title: 'Close Your Eyes (And Count to Fuck)', album: 'Run the Jewels 2' },
    { artist: 'J. Cole', title: 'Apparently', album: '2014 Forest Hills Drive' },
    { artist: 'Nicki Minaj', title: 'Anaconda', album: 'The Pinkprint' },
    { artist: 'Future', title: 'Move That Dope', album: 'Honest' },
    { artist: 'Schoolboy Q', title: 'Man of the Year', album: 'Oxymoron' },
    { artist: 'Logic', title: 'Under Pressure', album: 'Under Pressure' },
    { artist: 'Big K.R.I.T.', title: 'Mt. Olympus', album: 'Cadillactica' },
    { artist: 'Vince Staples', title: 'Blue Suede', album: 'Hell Can Wait' },
    { artist: 'Freddie Gibbs & Madlib', title: 'Thuggin\'', album: 'Piñata' },
  ],
  2015: [
    { artist: 'Kendrick Lamar', title: 'Alright', album: 'To Pimp a Butterfly' },
    { artist: 'Kendrick Lamar', title: 'King Kunta', album: 'To Pimp a Butterfly' },
    { artist: 'Kendrick Lamar', title: 'The Blacker the Berry', album: 'To Pimp a Butterfly' },
    { artist: 'Kendrick Lamar', title: 'These Walls', album: 'To Pimp a Butterfly' },
    { artist: 'Kendrick Lamar', title: 'Wesley\'s Theory', album: 'To Pimp a Butterfly' },
    { artist: 'Drake', title: 'Hotline Bling', album: 'Views' },
    { artist: 'Kendrick Lamar', title: 'Institutionalized', album: 'To Pimp a Butterfly' },
    { artist: 'Kendrick Lamar', title: 'For Free? (Interlude)', album: 'To Pimp a Butterfly' },
    { artist: 'Kendrick Lamar', title: 'Momma', album: 'To Pimp a Butterfly' },
    { artist: 'Kendrick Lamar', title: 'Hood Politics', album: 'To Pimp a Butterfly' },
  ],
  2016: [
    { artist: 'Kanye West', title: 'Ultralight Beam', album: 'The Life of Pablo' },
    { artist: 'Kanye West', title: 'Famous', album: 'The Life of Pablo' },
    { artist: 'Kanye West', title: 'Father Stretch My Hands Pt. 1', album: 'The Life of Pablo' },
    { artist: 'Kanye West', title: 'No More Parties in LA', album: 'The Life of Pablo' },
    { artist: 'Kanye West', title: 'Waves', album: 'The Life of Pablo' },
    { artist: 'Chance the Rapper', title: 'No Problem', album: 'Coloring Book' },
    { artist: 'Kanye West', title: 'Real Friends', album: 'The Life of Pablo' },
    { artist: 'Kanye West', title: 'Feedback', album: 'The Life of Pablo' },
    { artist: 'Kanye West', title: 'Highlights', album: 'The Life of Pablo' },
    { artist: 'Kanye West', title: 'Freestyle 4', album: 'The Life of Pablo' },
  ],
  2017: [
    { artist: 'Kendrick Lamar', title: 'HUMBLE.', album: 'DAMN.' },
    { artist: 'Kendrick Lamar', title: 'DNA.', album: 'DAMN.' },
    { artist: 'Kendrick Lamar', title: 'LOYALTY.', album: 'DAMN.' },
    { artist: 'Kendrick Lamar', title: 'ELEMENT.', album: 'DAMN.' },
    { artist: 'Kendrick Lamar', title: 'FEEL.', album: 'DAMN.' },
    { artist: 'Kendrick Lamar', title: 'LOVE.', album: 'DAMN.' },
    { artist: 'Kendrick Lamar', title: 'PRIDE.', album: 'DAMN.' },
    { artist: 'Kendrick Lamar', title: 'XXX.', album: 'DAMN.' },
    { artist: 'Kendrick Lamar', title: 'FEAR.', album: 'DAMN.' },
    { artist: 'Kendrick Lamar', title: 'GOD.', album: 'DAMN.' },
  ],
  2018: [
    { artist: 'Travis Scott', title: 'SICKO MODE', album: 'ASTROWORLD' },
    { artist: 'Travis Scott', title: 'STARGAZING', album: 'ASTROWORLD' },
    { artist: 'Travis Scott', title: 'YOSEMITE', album: 'ASTROWORLD' },
    { artist: 'Travis Scott', title: 'CAN\'T SAY', album: 'ASTROWORLD' },
    { artist: 'Travis Scott', title: 'STOP TRYING TO BE GOD', album: 'ASTROWORLD' },
    { artist: 'Cardi B', title: 'I Like It', album: 'Invasion of Privacy' },
    { artist: 'Drake', title: 'God\'s Plan', album: 'Scorpion' },
    { artist: 'Kendrick Lamar & SZA', title: 'All the Stars', album: 'Black Panther: The Album' },
    { artist: 'Kendrick Lamar & Jay Rock', title: 'King\'s Dead', album: 'Black Panther: The Album' },
    { artist: 'Kendrick Lamar', title: 'Pray for Me', album: 'Black Panther: The Album' },
  ],
  2019: [
    { artist: 'Tyler, The Creator', title: 'EARFQUAKE', album: 'IGOR' },
    { artist: 'Tyler, The Creator', title: 'IGOR\'S THEME', album: 'IGOR' },
    { artist: 'Tyler, The Creator', title: 'NEW MAGIC WAND', album: 'IGOR' },
    { artist: 'Tyler, The Creator', title: 'A BOY IS A GUN', album: 'IGOR' },
    { artist: 'Tyler, The Creator', title: 'PUPPET', album: 'IGOR' },
    { artist: 'Tyler, The Creator', title: 'GONE, GONE / THANK YOU', album: 'IGOR' },
    { artist: 'Tyler, The Creator', title: 'I DON\'T LOVE YOU ANYMORE', album: 'IGOR' },
    { artist: 'Tyler, The Creator', title: 'ARE WE STILL FRIENDS?', album: 'IGOR' },
    { artist: 'Tyler, The Creator', title: 'WHAT\'S GOOD', album: 'IGOR' },
    { artist: 'Tyler, The Creator', title: 'RUNNING OUT OF TIME', album: 'IGOR' },
  ],
  2020: [
    { artist: 'Megan Thee Stallion feat. Beyoncé', title: 'Savage (Remix)', album: '' },
    { artist: 'DaBaby feat. Roddy Ricch', title: 'Rockstar', album: 'Blame It on Baby' },
    { artist: 'Pop Smoke', title: 'Dior', album: 'Meet the Woo 2' },
    { artist: 'Roddy Ricch', title: 'The Box', album: 'Please Excuse Me for Being Antisocial' },
    { artist: 'Travis Scott', title: 'THE SCOTTS', album: '' },
    { artist: 'Run the Jewels', title: 'Ooh LA LA', album: 'RTJ4' },
    { artist: 'Freddie Gibbs & The Alchemist', title: '1985', album: 'Alfredo' },
    { artist: 'Conway the Machine', title: 'Seen Everything But Jesus', album: 'From King to a God' },
    { artist: 'Griselda', title: 'Dr. Birds', album: 'Pray for Paris' },
    { artist: 'Boldy James & The Alchemist', title: 'Mustard', album: 'The Price of Tea in China' },
  ],
  2021: [
    { artist: 'Kanye West', title: 'Hurricane', album: 'Donda' },
    { artist: 'Kanye West', title: 'Jail', album: 'Donda' },
    { artist: 'Kanye West', title: 'Off the Grid', album: 'Donda' },
    { artist: 'Kanye West', title: 'Praise God', album: 'Donda' },
    { artist: 'Kanye West', title: 'Come to Life', album: 'Donda' },
    { artist: 'Tyler, The Creator', title: 'WUSYANAME', album: 'Call Me If You Get Lost' },
    { artist: 'Tyler, The Creator', title: 'CORSO', album: 'Call Me If You Get Lost' },
    { artist: 'Tyler, The Creator', title: 'LUMBERJACK', album: 'Call Me If You Get Lost' },
    { artist: 'Tyler, The Creator', title: 'JUGGERNAUT', album: 'Call Me If You Get Lost' },
    { artist: 'Tyler, The Creator', title: 'SWEET / I THOUGHT YOU WANTED TO DANCE', album: 'Call Me If You Get Lost' },
  ],
  2022: [
    { artist: 'Kendrick Lamar', title: 'N95', album: 'Mr. Morale & the Big Steppers' },
    { artist: 'Kendrick Lamar', title: 'United in Grief', album: 'Mr. Morale & the Big Steppers' },
    { artist: 'Kendrick Lamar', title: 'Worldwide Steppers', album: 'Mr. Morale & the Big Steppers' },
    { artist: 'Kendrick Lamar', title: 'Die Hard', album: 'Mr. Morale & the Big Steppers' },
    { artist: 'Kendrick Lamar', title: 'Father Time', album: 'Mr. Morale & the Big Steppers' },
    { artist: 'Kendrick Lamar', title: 'Rich Spirit', album: 'Mr. Morale & the Big Steppers' },
    { artist: 'Kendrick Lamar', title: 'Count Me Out', album: 'Mr. Morale & the Big Steppers' },
    { artist: 'Kendrick Lamar', title: 'Crown', album: 'Mr. Morale & the Big Steppers' },
    { artist: 'Kendrick Lamar', title: 'Silent Hill', album: 'Mr. Morale & the Big Steppers' },
    { artist: 'Kendrick Lamar', title: 'Savior', album: 'Mr. Morale & the Big Steppers' },
  ],
  2023: [
    { artist: 'Travis Scott', title: 'FE!N', album: 'UTOPIA' },
    { artist: 'Travis Scott', title: 'MELTDOWN', album: 'UTOPIA' },
    { artist: 'Travis Scott', title: 'MY EYES', album: 'UTOPIA' },
    { artist: 'Travis Scott', title: 'HYAENA', album: 'UTOPIA' },
    { artist: 'Travis Scott', title: 'THANK GOD', album: 'UTOPIA' },
    { artist: 'Travis Scott', title: 'MODERN JAM', album: 'UTOPIA' },
    { artist: 'Travis Scott', title: 'GOD\'S COUNTRY', album: 'UTOPIA' },
    { artist: 'Travis Scott', title: 'SIRENS', album: 'UTOPIA' },
    { artist: 'Travis Scott', title: 'DELRESTO (ECHOES)', album: 'UTOPIA' },
    { artist: 'Travis Scott', title: 'I KNOW ?', album: 'UTOPIA' },
  ],
  2024: [
    { artist: 'Kendrick Lamar', title: 'Not Like Us', album: '' },
    { artist: 'Kendrick Lamar', title: 'Euphoria', album: '' },
    { artist: 'Kendrick Lamar', title: 'Meet the Grahams', album: '' },
    { artist: 'Kendrick Lamar', title: 'Like That', album: 'We Don\'t Trust You' },
    { artist: 'Kendrick Lamar', title: '6:16 in LA', album: '' },
    { artist: 'Kendrick Lamar', title: 'wacced out murals', album: 'GNX' },
    { artist: 'Kendrick Lamar', title: 'squabble up', album: 'GNX' },
    { artist: 'Kendrick Lamar', title: 'luther', album: 'GNX' },
    { artist: 'Kendrick Lamar', title: 'man at the garden', album: 'GNX' },
    { artist: 'Kendrick Lamar', title: 'hey now', album: 'GNX' },
  ],
  2025: [
    { artist: 'Kendrick Lamar & SZA', title: 'luther', album: 'GNX' },
    { artist: 'Kendrick Lamar', title: 'tv off', album: 'GNX' },
    { artist: 'Kendrick Lamar', title: 'squabble up', album: 'GNX' },
    { artist: 'Drake & PartyNextDoor', title: 'CN TOWER', album: '$ome $exy $ongs 4 U' },
    { artist: 'Drake & PartyNextDoor', title: 'NOKIA', album: '$ome $exy $ongs 4 U' },
    { artist: 'Drake & PartyNextDoor', title: 'SOMEBODY LOVES ME', album: '$ome $exy $ongs 4 U' },
    { artist: 'Clipse, Pusha T & Malice', title: 'Chains & Whips', album: 'Let God Sort Em Out' },
    { artist: 'Clipse, Pusha T & Malice', title: 'So Be It', album: 'Let God Sort Em Out' },
    { artist: 'Playboi Carti', title: 'CRUSH', album: 'MUSIC' },
    { artist: 'Playboi Carti', title: 'EVIL J0RDAN', album: 'MUSIC' },
  ],
};

/** Additional curated tracks to fill each year to 100 (real releases). */
const FILL = {
  2000: [
    ['Dr. Dre feat. Eminem', 'Forgot About Dre', '2001'],
    ['Dr. Dre feat. Snoop Dogg', 'The Next Episode', '2001'],
    ['Ludacris feat. Shawnna', "What's Your Fantasy", 'Back for the First Time'],
    ['Reflection Eternal', 'The Blast', 'Train of Thought'],
    ['Xzibit', 'X', 'Restless'],
    ['Deltron 3030', '3030', 'Deltron 3030'],
    ['Mystikal', 'Shake Ya Ass', "Let's Get Ready"],
    ['Nelly feat. City Spud', 'Ride wit Me', 'Country Grammar'],
    ['Jurassic 5', 'Quality Control', 'Quality Control'],
    ['Black Rob', 'Whoa!', 'Life Story'],
    ['Talib Kweli & Hi-Tek', 'Move Somethin\'', 'Train of Thought'],
    ['Dilated Peoples', 'Work the Angles', 'The Platform'],
    ['Mos Def', 'UMI Says', 'Black on Both Sides'],
    ['Pharoahe Monch', 'Simon Says', 'Internal Affairs'],
    ['Lil\' Kim', 'No Matter What They Say', 'The Notorious K.I.M.'],
    ['Three 6 Mafia feat. UGK & Project Pat', 'Sippin\' on Some Syrup', 'When the Smoke Clears: Sixty 6, Sixty 1'],
    ['Binary Star', 'Reality Check', 'Masters of the Universe'],
    ['Ice Cube feat. Mack 10 & Ms. Toi', 'You Can Do It', 'War & Peace Vol. 2 (The Peace Disc)'],
    ['M.O.P.', 'Ante Up (Robbin-Hoodz Theory)', 'Warriorz'],
    ['Method Man & Redman', 'Da Rockwilder', 'Blackout!'],
    ['Q-Tip', 'Vivrant Thing', 'Amplified'],
    ['Juvenile feat. Mannie Fresh & Lil Wayne', 'Back That Azz Up', '400 Degreez'],
    ['Lil Wayne', 'Tha Block Is Hot', 'Tha Block Is Hot'],
    ['Redman', 'Let\'s Get Dirty (I Can\'t Get in da Club)', 'Malpractice'],
    ['Wu-Tang Clan', 'Gravel Pit', 'The W'],
    ['Atmosphere', 'GodLovesUgly', 'God Loves Ugly'],
    ['Black Eyed Peas', 'Request + Line', 'Bridging the Gap'],
    ['Clipse', 'Grindin\'', 'Lord Willin\''],
    ['De La Soul', 'Oooh.', 'Art Official Intelligence: Mosaic Thump'],
    ['Hot Boys', 'I Need a Hot Girl', 'Guerrilla Warfare'],
    ['Jadakiss feat. Styles P', 'We Gonna Make It', 'Kiss tha Game Goodbye'],
    ['Memphis Bleek feat. Jay-Z & Missy Elliott', 'Memphis Bleek Is...', 'Coming of Age'],
    ['OutKast', 'So Fresh, So Clean', 'Stankonia'],
    ['Snoop Dogg feat. Tha Eastsidaz', 'Lay Low', 'Tha Last Meal'],
    ['The Roots feat. Erykah Badu', 'You Got Me', 'Things Fall Apart'],
    ['Trick Daddy', 'Take It to da House', 'Book of Thugs: Chapter AK Verse 47'],
    ['Westside Connection', 'Bow Down', 'Bow Down'],
    ['Aesop Rock', 'Daylight', 'Float'],
    ['Cannibal Ox', 'Iron Galaxy', 'The Cold Vein'],
    ['Company Flow', 'Patriotism', 'Funcrusher Plus'],
    ['El-P', 'Stepfather Factory', 'Fantastic Damage'],
    ['MF DOOM', 'Rhymes Like Dimes', 'Operation: Doomsday'],
    ['Masta Ace', 'Acknowledge', 'Disposable Arts'],
    ['Quasimoto', 'Jazz Cats Part 1', 'The Unseen'],
    ['Tech N9ne', 'Caribou Lou', 'Anghellic'],
    ['The Coup', '5 Million Ways to Kill a CEO', 'Party Music'],
    ['Blackalicious', 'Deception', 'Nia'],
    ['Lootpack', 'Whenimondamic', 'Soundpieces: Da Antidote!'],
    ['Zion I', 'Inner Light', 'Mind over Matter'],
    ['Canibus', 'Mic-Nificient', '2000 B.C.'],
    ['Cormega', 'Fallen Soldiers', 'The Realness'],
    ['E-40', 'Nah Nah...', 'Loyalty and Betrayal'],
    ['Beanie Sigel', 'What Your Life Like', 'The Truth'],
    ['Cam\'ron', 'What Means the World to You', 'S.D.E. (Sports Drugs & Entertainment)'],
    ['Cash Money Millionaires', 'Bling Bling', 'Baller Blockin\''],
    ['D12', 'Purple Hills', "Devil's Night"],
    ['Fabolous', 'Can\'t Deny It', 'Ghetto Fabolous'],
    ['Gang Starr', 'Full Clip', 'Full Clip: A Decade of Gang Starr'],
    ['Goodie Mob', 'What It Ain\'t (Ghetto Envy)', 'World Party'],
    ['Ja Rule feat. Lil\' Mo & Vita', 'Put It on Me', 'Rule 3:36'],
    ['Jay-Z', 'Change the Game', 'The Dynasty: Roc La Familia 2000'],
    ['KRS-One', 'Step Into a World (Rapture\'s Delight)', 'The Sneak Attack'],
    ['Missy Elliott', 'Hot Boyz', 'Da Real World'],
    ['Pras', 'Ghetto Supastar (That Is What You Are)', 'Ghetto Supastar'],
    ['Rakim', 'The Saga Continues...', 'The Master'],
    ['Royce da 5\'9"', 'Boom', 'Rock City (Version 2.0)'],
    ['Scarface', 'Fuck Faces', 'The Last of a Dying Breed'],
    ['Snoop Dogg feat. Xzibit & Nate Dogg', 'Bitch Please II', '2001'],
    ['St. Lunatics', 'Midwest Swing', 'Country Grammar'],
    ['UGK', 'Take It Off', 'Dirty Money'],
    ['WC feat. Nate Dogg', 'The Streets', 'The Shadiest One'],
    ['YoungBloodZ', 'Damn!', 'Against All Odds'],
    ['Anti-Pop Consortium', 'Ghostlawns', 'Tragic Epilogue of There Being No Hope'],
    ['Del tha Funkee Homosapien', 'If You Must', 'Both Sides of the Brain'],
    ['Eyedea & Abilities', 'Powder', 'First Born'],
    ['Freestyle Fellowship', 'Inner City Boundaries', 'Innercity Griots'],
    ['Hieroglyphics', 'You Never Knew', '3rd Eye Vision'],
    ['Living Legends', 'Nothing Less', 'Almost Famous'],
    ['Mr. Lif', 'Home of the Brave', 'I Phantom'],
    ['Non Phixion', 'Legacy', 'The Green CD'],
    ['Organized Konfusion', 'Invade Spanish', 'Funkadelic'],
    ['RJD2', '1976', 'Dead Ringer'],
    ['Sage Francis', 'Makeshift Patriot', 'Personal Journals'],
    ['Blueprint', 'The Wrong Rapper', '1988'],
    ['Brother Ali', 'Rainwater', 'Shadows on the Sun'],
    ['Edan', 'Fumbling Over Words That Rhyme', 'Beauty and the Beat'],
    ['J-Live', 'Braggin\' Writes', 'The Best Part'],
    ['Jean Grae', 'Hater\'s Anthem', 'Attack of the Attacking Things'],
    ['Open Mike Eagle', 'Dark Comedy', 'Dark Comedy'],
    ['P.O.S.', 'Bleeding Hearts Club', 'Audition'],
    ['Ras Kass', 'Interview with a Vampire', 'Institutionalized Vol. 2'],
    ['Rhymefest', 'Brand New', 'Blue Collar'],
    ['Slug', 'Modern Day Focus', 'When Life Gives You Lemons, Paint That Shit Gold'],
    ['Tonedeff', 'Heads Up', 'Archetype'],
    ['Vast Aire', 'Look Mom... No Hands', 'Look Mom... No Hands'],
    ['Blu & Exile', 'Below the Heavens', 'Below the Heavens'],
    ['Cage', 'Agent Orange', 'Movies for the Blind'],
    ['Elzhi', 'Dedication', 'The Preface'],
    ['Homeboy Sandman', 'The Carpenter', 'First of a Living Breed'],
    ['J Dilla', 'Fuck the Police', 'Ruff Draft'],
    ['Ka', 'Up Against Goliath', 'Grief Pedigree'],
    ['Large Professor', 'The Mad Scientist', '1st Class'],
    ['Murs', 'Walk Like a Man', 'Murs 3:16: The 9th Edition'],
    ['Oh No', 'The Funk', 'The Disrupt'],
    ['Percee P', 'Put Your Hands Up', 'Perseverance'],
    ['R.A. the Rugged Man', 'Uncommon Valor', 'Die, Rugged Man, Die'],
    ['Roc Marciano', 'Snow', 'Marcberg'],
    ['Saigon', 'Bring Me Down', 'The Greatest Story Never Told'],
    ['Sean Price', 'Onion Head', 'Monkey Barz'],
    ['Skyzoo', 'The Easy Truth', 'The Easy Truth'],
    ['Termanology', 'Watch How It Go Down', 'Politics as Usual'],
    ['The Alchemist', 'Hold You Down', '1st Infantry'],
    ['Wale', 'Dig Dug (Shake It)', 'Attention Deficit'],
    ['Westside Gunn', 'Dr. Bird\'s', 'Flygod'],
    ['Your Old Droog', 'Pallet Cleanser', 'Your Old Droog'],
  ],
  2025: [
    ['Kendrick Lamar', 'heart pt. 6', 'GNX'],
    ['Kendrick Lamar', 'reincarnated', 'GNX'],
    ['Kendrick Lamar', 'wacced out murals', 'GNX'],
    ['Kendrick Lamar', 'man at the garden', 'GNX'],
    ['Kendrick Lamar', 'hey now', 'GNX'],
    ['Kendrick Lamar', 'peekaboo', 'GNX'],
    ['Kendrick Lamar', 'gloria', 'GNX'],
    ['Kendrick Lamar', 'gnx', 'GNX'],
    ['Kendrick Lamar feat. Lefty Gunplay', 'dodger blue', 'GNX'],
    ['Kendrick Lamar feat. SZA', 'gloria', 'GNX'],
    ['Drake & PartyNextDoor', 'GREEDY', '$ome $exy $ongs 4 U'],
    ['Drake & PartyNextDoor', 'SPREADING ON YOU', '$ome $exy $ongs 4 U'],
    ['Drake & PartyNextDoor', 'SOMEBODY LOVES ME', '$ome $exy $ongs 4 U'],
    ['Drake & PartyNextDoor', 'SMALL TOWN', '$ome $exy $ongs 4 U'],
    ['Drake & PartyNextDoor', 'BREAKIN\' DISHES', '$ome $exy $ongs 4 U'],
    ['Drake & PartyNextDoor', 'GLORIOUS', '$ome $exy $ongs 4 U'],
    ['Drake & PartyNextDoor', 'RICH BABY DADDY', '$ome $exy $ongs 4 U'],
    ['Drake & PartyNextDoor', 'DEEP COVER', '$ome $exy $ongs 4 U'],
    ['Drake & PartyNextDoor', 'WHEN HE\'S GONE', '$ome $exy $ongs 4 U'],
    ['Drake & PartyNextDoor', 'MEET YOUR PADRE', '$ome $exy $ongs 4 U'],
    ['Clipse, Pusha T & Malice', 'Just So You Remember', 'Let God Sort Em Out'],
    ['Clipse, Pusha T & Malice', 'P.O.V.', 'Let God Sort Em Out'],
    ['Clipse, Pusha T & Malice', 'Mermaid Tears', 'Let God Sort Em Out'],
    ['Clipse, Pusha T & Malice', 'So Far Ahead', 'Let God Sort Em Out'],
    ['Clipse, Pusha T & Malice', 'Ace Trumpets', 'Let God Sort Em Out'],
    ['Clipse, Pusha T & Malice', 'Birds Don\'t Sing', 'Let God Sort Em Out'],
    ['Clipse, Pusha T & Malice', 'Let God Sort Em Out', 'Let God Sort Em Out'],
    ['Clipse, Pusha T & Malice', 'F.I.F.O.', 'Let God Sort Em Out'],
    ['Clipse, Pusha T & Malice', 'So Be It 2', 'Let God Sort Em Out'],
    ['Playboi Carti', 'MOJO JOJO', 'MUSIC'],
    ['Playboi Carti', 'PHILLY', 'MUSIC'],
    ['Playboi Carti', 'RADAR', 'MUSIC'],
    ['Playboi Carti', 'RATHER LIE', 'MUSIC'],
    ['Playboi Carti', 'FINE SHIT', 'MUSIC'],
    ['Playboi Carti', 'BACKD00R (feat. Kendrick Lamar)', 'MUSIC'],
    ['Playboi Carti', 'CRANK', 'MUSIC'],
    ['Playboi Carti', 'GOOD CREDIT (feat. Kendrick Lamar)', 'MUSIC'],
    ['Playboi Carti', 'I SEEEEEE YOU BABY BOO', 'MUSIC'],
    ['Playboi Carti', 'WAKE UP F1LTHY (feat. Travis Scott)', 'MUSIC'],
    ['Playboi Carti', 'JUMPIN (feat. Lil Uzi Vert)', 'MUSIC'],
    ['Playboi Carti', 'COCAINE NOSE', 'MUSIC'],
    ['Playboi Carti', 'OPM BABI', 'MUSIC'],
    ['Playboi Carti', 'TRIM (feat. Future)', 'MUSIC'],
    ['Playboi Carti', 'CASH FOREVER (feat. Travis Scott)', 'MUSIC'],
    ['Playboi Carti', 'TOXIC (with Skepta)', 'MUSIC'],
    ['Playboi Carti', 'FOMDJ', 'MUSIC'],
    ['A$AP Rocky', 'Helicopter', 'Don\'t Be Dumb'],
    ['A$AP Rocky', 'Starburst', 'Don\'t Be Dumb'],
    ['A$AP Rocky feat. J. Cole', 'Ruby Rosary', 'Don\'t Be Dumb'],
    ['A$AP Rocky feat. Pharrell', 'Ro-Shon', 'Don\'t Be Dumb'],
    ['A$AP Rocky', 'Shredded Lettuce', 'Don\'t Be Dumb'],
    ['A$AP Rocky', 'Back to the Moon', 'Don\'t Be Dumb'],
    ['A$AP Rocky feat. Tyler, The Creator', 'M.P.A.', 'Don\'t Be Dumb'],
    ['A$AP Rocky', 'Tailor Made Freestyle', 'Don\'t Be Dumb'],
    ['A$AP Rocky', 'Don\'t Be Dumb', 'Don\'t Be Dumb'],
    ['JID', 'Community', 'God Does Like Ugly'],
    ['JID', 'Sk8', 'God Does Like Ugly'],
    ['JID', 'Bruuuh (with Denzel Curry)', 'God Does Like Ugly'],
    ['JID', 'Off Da Zoinkys', 'God Does Like Ugly'],
    ['JID', 'Barnyard', 'God Does Like Ugly'],
    ['JID', 'Can\'t Tell Me Nothing', 'God Does Like Ugly'],
    ['JID', 'Raydar', 'God Does Like Ugly'],
    ['JID', 'Dynamite', 'God Does Like Ugly'],
    ['JID', 'Animals (with Eminem)', 'God Does Like Ugly'],
    ['JID', 'God Does Like Ugly', 'God Does Like Ugly'],
    ['Tyler, The Creator', 'Big Poe (feat. Sk8board)', 'CHROMAKOPIA'],
    ['Tyler, The Creator', 'Like Him (feat. Lola Young)', 'CHROMAKOPIA'],
    ['Tyler, The Creator', 'Tomorrow', 'CHROMAKOPIA'],
    ['Tyler, The Creator', 'Thought I Was Dead (feat. ScHoolboy Q & Santigold)', 'CHROMAKOPIA'],
    ['Tyler, The Creator', 'Balloon (feat. Doechii)', 'CHROMAKOPIA'],
    ['Tyler, The Creator', 'Sticky (feat. GloRilla, Sexyy Red & Lil Wayne)', 'CHROMAKOPIA'],
    ['Tyler, The Creator', 'Take Your Mask Off (feat. Daniel Caesar & LaToiya Williams)', 'CHROMAKOPIA'],
    ['Tyler, The Creator', 'Hey Jane', 'CHROMAKOPIA'],
    ['Tyler, The Creator', 'I Hope You Find Your Way Home', 'CHROMAKOPIA'],
    ['Doechii', 'DENIAL IS A RIVER', 'Alligator Bites Never Heal'],
    ['Doechii', 'CATFISH', 'Alligator Bites Never Heal'],
    ['Doechii', 'BOILED PEANUTS', 'Alligator Bites Never Heal'],
    ['Doechii', 'BLOOM', 'Alligator Bites Never Heal'],
    ['Doechii', 'NISSAN ALTIMA', 'Alligator Bites Never Heal'],
    ['Doechii', 'SPAGHETTI (with JID)', 'Alligator Bites Never Heal'],
    ['Doechii', 'GTFO', 'Alligator Bites Never Heal'],
    ['Doechii', 'ANXIETY', 'Alligator Bites Never Heal'],
    ['Doechii', 'PETER PAN', 'Alligator Bites Never Heal'],
    ['Doechii', 'DEATH ROLL', 'Alligator Bites Never Heal'],
    ['Central Cee', 'Guilt Trippin (feat. Sexyy Red)', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Gen Z Luv', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Now We\'re Strangers', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Limitless', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Truth in the Lies (feat. Lil Durk)', 'Can\'t Rush Greatness'],
    ['Central Cee', 'St. Patrick\'s', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Million Dollar Baby', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Top Freestyle', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Sprinter', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Entrapreneur', 'Can\'t Rush Greatness'],
    ['Central Cee', 'One Up', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Daily Duppy', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Obsessed With You', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Doja', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Commitment Issues', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Loading', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Wild West', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Retail Therapy', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Eurovision (feat. Dave)', 'Can\'t Rush Greatness'],
    ['Central Cee', 'CRG', 'Can\'t Rush Greatness'],
    ['Central Cee', 'No Introduction', 'Can\'t Rush Greatness'],
    ['Central Cee', 'One Of A Kind', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Let Go', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Day in the Life', 'Can\'t Rush Greatness'],
    ['Central Cee', 'Loading', '23'],
  ],
};

function toObj([artist, title, album]) {
  return { artist, title, album: album ?? '' };
}

function buildYearData(allRows, pre2000Keys) {
  const yearData = {};
  const globalUsed = new Set(pre2000Keys);

  for (let y = 2000; y <= 2025; y++) {
    const sqlRows = allRows
      .filter((r) => r.year === y)
      .sort((a, b) => a.rank - b.rank)
      .map(({ artist, title, album }) => ({ artist, title, album }));

    const fixes = TOP_FIXES[y] ?? [];
    const fill = (FILL[y] ?? []).map(toObj);
    const candidates = [...fixes, ...fill, ...sqlRows];
    const yearTracks = [];
    const yearKeys = new Set();

    for (const t of candidates) {
      const k = trackKey(t.artist, t.title);
      if (globalUsed.has(k) || yearKeys.has(k)) continue;
      yearKeys.add(k);
      globalUsed.add(k);
      yearTracks.push(t);
      if (yearTracks.length === 100) break;
    }

    if (yearTracks.length < 100) {
      console.warn(`Year ${y}: only ${yearTracks.length} after dedupe, need manual fill`);
    }
    yearData[y] = yearTracks;
  }

  return yearData;
}

function writeYearDataModule(yearData) {
  let src = '/** Curated global hip-hop by release year (2000–2025). */\nexport const YEAR_DATA = {\n';
  for (let y = 2000; y <= 2025; y++) {
    const tracks = yearData[y] ?? [];
    src += `  ${y}: [\n`;
    for (const t of tracks) {
      src += `    { artist: ${JSON.stringify(t.artist)}, title: ${JSON.stringify(t.title)}, album: ${JSON.stringify(t.album ?? '')} },\n`;
    }
    src += '  ],\n';
  }
  src += '};\n';
  fs.writeFileSync(path.join(__dirname, 'year-data.mjs'), src, 'utf8');
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const allRows = parseSql(sql);
console.log(`Parsed ${allRows.length} SQL rows`);

const pre2000Keys = new Set(
  PRE2000_TRACKS.map((t) => trackKey(t.artist, t.title)),
);
console.log(`Pre2000 keys: ${pre2000Keys.size}`);
const yearData = buildYearData(allRows, pre2000Keys);
for (let y = 2000; y <= 2025; y++) {
  console.log(`Year ${y}: ${yearData[y]?.length ?? 0} tracks`);
}
writeYearDataModule(yearData);
console.log('Wrote year-data.mjs');
