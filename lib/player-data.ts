import { Season } from './types'

export interface PlayerContract {
  id: string
  name: string
  team: string
  salary: Partial<Record<Season, number>>
  options: Partial<Record<Season, 'Player' | 'Team'>>
}

// Parse salary string like "$59,606,817" to number
function parseSalary(s: string): number {
  if (!s || s === '') return 0
  return parseInt(s.replace(/[$,]/g, ''), 10) || 0
}

// Parse option string
function parseOption(s: string): 'Player' | 'Team' | undefined {
  if (s === 'Player') return 'Player'
  if (s === 'Team') return 'Team'
  return undefined
}

// Raw CSV data - parsed at build time
const RAW_DATA = `Player,Tm,25-26,25-26 Option,26-27,26-27 Option,27-28,27-28 Option,28-29,28-29 Option,29-30,29-30 Option
Stephen Curry,GSW,"$59,606,817",,"$62,587,158",,,,,,
Joel Embiid,PHI,"$55,224,526",,"$58,100,000",,"$62,748,000",,"$67,396,000",Player,,
Nikola Jokić,DEN,"$55,224,526",,"$59,033,114",,"$62,841,702",Player,,,,
Kevin Durant,HOU,"$54,708,609",,"$43,902,439",,"$46,097,561",Player,,,,
Jayson Tatum,BOS,"$54,126,450",,"$58,456,566",,"$62,786,682",,"$67,116,798",,"$71,446,914",Player
Anthony Davis,WAS,"$54,126,450",,"$58,456,566",,"$62,786,682",Player,,,,
Giannis Antetokounmpo,MIL,"$54,126,450",,"$58,456,566",,"$62,786,682",Player,,,,
Jimmy Butler,GSW,"$54,126,450",,"$56,832,773",,,,,,
Jaylen Brown,BOS,"$53,142,264",,"$57,078,728",,"$61,015,192",,"$64,951,656",,
Devin Booker,PHO,"$53,142,264",,"$57,078,728",,"$61,015,192",,"$64,065,952",,"$69,191,228",Player
Karl-Anthony Towns,NYK,"$53,142,264",,"$57,078,728",,"$61,015,192",Player,,,,
LeBron James,LAL,"$52,627,153",Player,,,,,,,,
Paul George,PHI,"$51,666,090",,"$54,126,380",,"$56,586,670",Player,,,,
Kawhi Leonard,LAC,"$50,000,000",,"$50,300,000",,,,,,
Zach LaVine,SAC,"$47,499,660",,"$48,967,380",Player,,,,,,
Cade Cunningham,DET,"$46,394,100",,"$50,105,628",,"$53,817,156",,"$57,528,684",,"$61,240,212",
Evan Mobley,CLE,"$46,394,100",,"$50,105,628",,"$53,817,156",,"$57,528,684",,"$61,240,212",
Jamal Murray,DEN,"$46,394,100",,"$50,105,628",,"$53,817,156",,"$57,528,684",,
Lauri Markkanen,UTA,"$46,394,100",,"$46,113,154",,"$49,824,681",,"$53,536,209",,
Donovan Mitchell,CLE,"$46,394,100",,"$50,105,628",,"$53,817,156",Player,,,,
Trae Young,WAS,"$46,394,100",,"$48,967,380",Player,,,,,,
Luka Dončić,LAL,"$45,999,660",,"$49,800,000",,"$53,784,000",,"$57,768,000",Player,,
Anthony Edwards,MIN,"$45,550,512",,"$48,924,624",,"$52,298,736",,"$55,672,848",,
Tyrese Haliburton,IND,"$45,550,512",,"$48,924,624",,"$52,298,736",,"$55,672,848",,
Pascal Siakam,IND,"$45,550,512",,"$48,924,624",,"$52,298,736",,,,
Domantas Sabonis,SAC,"$42,336,000",,"$45,472,000",,"$48,608,000",,,,
OG Anunoby,NYK,"$39,568,966",,"$42,500,000",,"$45,431,034",,"$48,362,068",Player,,
Zion Williamson,NOP,"$39,446,090",,"$42,166,510",,"$44,886,930",,,,
Ja Morant,MEM,"$39,446,090",,"$42,166,510",,"$44,886,930",,,,
Darius Garland,LAC,"$39,446,090",,"$42,166,510",,"$44,886,930",,,,
James Harden,CLE,"$39,182,693",,"$42,317,307",Player,,,,,,
Scottie Barnes,TOR,"$38,661,750",,"$41,754,690",,"$44,847,630",,"$47,940,570",,"$51,033,510",
Franz Wagner,ORL,"$38,661,750",,"$41,754,690",,"$44,847,630",,"$47,940,570",,"$51,033,510",
Shai Gilgeous-Alexander,OKC,"$38,333,050",,"$40,806,150",,"$61,005,000",,"$65,885,400",,"$70,765,800",
Michael Porter Jr.,BRK,"$38,333,050",,"$40,806,150",,,,,,
Brandon Ingram,TOR,"$38,095,238",,"$40,000,000",,"$41,904,762",Player,,,,
Tyrese Maxey,PHI,"$37,958,760",,"$40,770,520",,"$43,582,280",,"$46,394,040",,
LaMelo Ball,CHO,"$37,958,760",,"$40,770,520",,"$43,582,280",,"$46,394,040",,
De'Aaron Fox,SAS,"$37,096,620",,"$49,800,000",,"$53,784,000",,"$57,768,000",,"$61,752,000",
Bam Adebayo,MIA,"$37,096,620",,"$49,800,000",,"$53,784,000",,"$57,768,000",Player,,
Desmond Bane,ORL,"$36,725,670",,"$39,446,090",,"$42,166,510",,"$44,886,930",,
Kyrie Irving,DAL,"$36,566,002",,"$39,491,282",,"$42,416,562",Player,,,,
Jaren Jackson Jr.,UTA,"$35,000,000",,"$49,000,000",,"$50,500,000",,"$52,000,000",,"$53,500,000",Player
Jalen Suggs,ORL,"$35,000,000",,"$32,400,000",,"$29,600,000",,"$26,800,000",,"$26,700,000",Team
Rudy Gobert,MIN,"$35,000,000",,"$36,500,000",,"$38,000,000",Player,,,,
Jalen Brunson,NYK,"$34,944,001",,"$37,739,521",,"$40,535,041",,"$43,330,561",Player,,
Alperen Şengün,HOU,"$33,944,954",,"$35,642,202",,"$37,339,450",,"$39,036,697",,"$39,036,697",Player
Jalen Green,PHO,"$33,584,499",,"$36,251,166",,"$36,000,000",Player,,,,
Khris Middleton,DAL,"$33,296,296",Player,,,,,,,,
Immanuel Quickley,TOR,"$32,500,000",,"$32,500,000",,"$32,500,000",,"$32,500,000",,
Jrue Holiday,POR,"$32,400,000",,"$34,800,000",,"$37,200,000",Player,,,,
Jerami Grant,POR,"$32,000,001",,"$34,206,898",,"$36,413,790",Player,,,,
Jordan Poole,NOP,"$31,848,215",,"$34,044,642",,,,,,
Tyler Herro,MIA,"$31,000,000",,"$33,000,000",,,,,,
Julius Randle,MIN,"$30,864,198",,"$33,333,334",,"$35,802,468",Player,,,,
Dejounte Murray,NOP,"$30,801,103",,"$32,785,071",,"$30,751,504",Player,,,,
Kristaps Porziņģis,GSW,"$30,731,707",,,,,,,,
CJ McCollum,ATL,"$30,666,666",,,,,,,,
Jalen Johnson,ATL,"$30,000,000",,"$30,000,000",,"$30,000,000",,"$30,000,000",,"$30,000,000",
Isaiah Hartenstein,OKC,"$28,500,000",,"$28,500,000",Team,,,,,,
Andrew Wiggins,MIA,"$28,223,215",,"$30,169,644",Player,,,,,,
Derrick White,BOS,"$28,100,000",,"$30,348,000",,"$32,596,000",,"$34,844,000",Player,,
RJ Barrett,TOR,"$27,705,357",,"$29,616,071",,,,,,
Anfernee Simons,CHI,"$27,678,571",,,,,,,,
Devin Vassell,SAS,"$27,000,000",,"$27,000,000",,"$24,652,174",,"$27,000,000",,
Terry Rozier,MIA,"$26,643,031",,,,,,,,
Tobias Harris,DET,"$26,634,146",,,,,,,,
John Collins,LAC,"$26,580,000",Player,,,,,,,,
Draymond Green,GSW,"$25,892,857",,"$27,678,571",,,,,,
Deandre Ayton,POR,"$33,654,814",,"$8,104,000",Player,,,,,,
Nic Claxton,BRK,"$25,352,272",,"$23,147,727",,"$20,943,184",,,,
Myles Turner,MIL,"$25,318,251",,"$26,584,164",,"$27,850,077",,"$29,115,990",Player,,
Trey Murphy III,NOP,"$25,000,000",,"$27,000,000",,"$29,000,000",,"$31,000,000",,
Josh Giddey,CHI,"$25,000,000",,"$25,000,000",,"$25,000,000",,"$25,000,000",,
Miles Bridges,CHO,"$25,000,000",,"$22,826,087",,,,,,
Fred VanVleet,HOU,"$25,000,000",,"$25,000,000",Player,,,,,,
Mikal Bridges,NYK,"$24,900,000",,"$33,482,145",,"$36,160,714",,"$38,839,285",,"$41,517,856",Player
DeMar DeRozan,SAC,"$24,570,000",,"$25,740,000",,,,,,
Jaden McDaniels,MIN,"$24,393,104",,"$26,200,001",,"$28,006,898",,"$29,813,790",,
Jonathan Kuminga,ATL,"$23,799,569",,"$24,300,000",Team,,,,,,
De'Andre Hunter,SAC,"$23,303,571",,"$24,910,714",,,,,,
Aaron Gordon,DEN,"$22,841,455",Player,"$33,658,037",,"$36,350,680",,"$39,043,323",Player,,
Damian Lillard,MIL,"$36,620,603",,"$35,915,403",,"$36,620,603",Player,,,,
Kyle Kuzma,MIL,"$22,410,605",,"$20,345,152",,,,,,
Kentavious Caldwell-Pope,MEM,"$21,621,500",,"$21,621,500",Player,,,,,,
Naz Reid,MIN,"$21,551,724",,"$23,275,862",,"$25,000,000",,"$26,724,138",,"$28,448,276",Player
Nikola Vučević,BOS,"$21,481,481",,,,,,,,
Dillon Brooks,PHO,"$21,124,110",,"$19,992,727",,,,,,
Cameron Johnson,DEN,"$21,057,065",,"$23,062,500",,,,,,
Norman Powell,MIA,"$20,482,758",,,,,,,,
Jarrett Allen,CLE,"$20,000,000",,"$28,000,000",,"$30,240,000",,"$32,480,000",,
Jakob Poeltl,TOR,"$19,500,000",,"$19,500,000",Player,,,,,,
Josh Hart,NYK,"$19,472,240",,"$20,923,760",,"$22,375,280",Team,,,,
Bradley Beal,PHO,"$24,737,010",,"$25,004,710",Player,,,,,,
Jusuf Nurkić,UTA,"$19,375,000",,,,,,,,
Harrison Barnes,SAS,"$19,000,000",,,,,,,,
Collin Sexton,CHI,"$18,975,000",,,,,,,,
Ivica Zubac,IND,"$18,893,980",,"$20,342,140",,"$21,790,300",,,,
Malik Monk,SAC,"$18,797,619",,"$20,190,035",,"$21,582,451",Player,,,,
Santi Aldama,MEM,"$18,485,916",,"$17,007,043",,"$17,007,043",Team,,,,
Rui Hachimura,LAL,"$18,259,259",,,,,,,,
Luguentz Dort,OKC,"$18,222,222",,"$18,222,222",Team,,,,,,
Alex Caruso,OKC,"$18,102,000",,"$19,550,160",,"$20,998,320",,"$22,446,480",,
Andrew Nembhard,IND,"$18,102,000",,"$19,550,160",,"$20,998,320",,,,
Zach Collins,CHI,"$18,080,496",,,,,,,,
Patrick Williams,CHI,"$18,000,000",,"$18,000,000",,"$18,000,000",,"$18,000,000",Player,,
Kevin Huerter,DET,"$17,991,071",,,,,,,,
Keldon Johnson,SAS,"$17,500,000",,"$17,500,000",,,,,,
Grayson Allen,PHO,"$16,875,000",,"$18,125,000",,"$19,375,000",Player,,,,
Duncan Robinson,DET,"$16,834,692",,"$15,992,957",,"$15,151,222",,,,
Klay Thompson,DAL,"$16,666,667",,"$17,460,317",,,,,,
Bogdan Bogdanović,LAC,"$16,020,000",,"$16,020,000",Team,,,,,,
Max Strus,CLE,"$15,936,452",,"$16,660,836",,,,,,
Terance Mann,BRK,"$15,500,000",,"$15,500,000",,"$16,000,000",,,,
Paolo Banchero,ORL,"$15,334,769",Team,,,,,,,,
Nickeil Alexander-Walker,ATL,"$15,161,800",,"$14,403,710",,"$15,161,800",,"$15,919,890",Player,,
Onyeka Okongwu,ATL,"$15,000,000",,"$16,120,000",,"$16,880,000",,,,
Jonathan Isaac,ORL,"$15,000,000",,"$14,500,000",,"$14,500,000",,"$15,000,000",,
Isaiah Stewart,DET,"$15,000,000",,"$15,000,000",,"$15,000,000",Team,,,,
Marcus Smart,WAS,"$19,920,855",,"$5,390,700",Player,,,,,,
Daniel Gafford,DAL,"$14,386,320",,"$17,263,584",,"$18,126,763",,"$18,989,942",,
Deni Avdija,POR,"$14,375,000",,"$13,125,000",,"$11,875,000",,,,
P.J. Washington,DAL,"$14,152,174",,"$19,813,044",,"$21,398,088",,"$22,983,132",,"$24,568,176",
Steven Adams,HOU,"$14,130,434",,"$13,000,000",,"$11,869,566",,,,
Caris LeVert,DET,"$14,104,000",,"$14,809,200",,,,,,
Dennis Schröder,CLE,"$14,104,000",,"$14,809,200",,"$15,514,400",,,,
Obi Toppin,IND,"$14,000,000",,"$15,000,000",,"$16,025,000",,,,
Corey Kispert,ATL,"$13,975,000",,"$13,975,000",,"$13,050,000",,"$13,050,000",Team,,
Herbert Jones,NOP,"$13,937,574",,"$14,898,786",,"$20,858,300",,"$22,526,964",,"$24,195,628",Player
Austin Reaves,LAL,"$13,937,574",,"$14,898,786",Player,,,,,,
Cooper Flagg,DAL,"$13,825,920",,"$14,517,480",,"$15,208,680",Team,,,,
Chet Holmgren,OKC,"$13,731,368",Team,,,,,,,,
Josh Green,CHO,"$13,666,667",,"$14,679,012",,,,,,
Grant Williams,CHO,"$13,645,500",,"$14,265,750",,,,,,
Bobby Portis,MIL,"$13,445,754",,"$14,521,414",,"$15,597,074",Player,,,,
Kelly Olynyk,SAS,"$13,445,122",,,,,,,,
Victor Wembanyama,SAS,"$13,376,880",Team,,,,,,,,
Robert Williams,POR,"$13,285,713",,,,,,,,
Zaccharie Risacher,ATL,"$13,197,720",,"$13,826,040",Team,,,,,,
Mitchell Robinson,NYK,"$12,954,546",,,,,,,,
Coby White,CHO,"$12,888,889",,,,,,,,
Dorian Finney-Smith,HOU,"$12,700,000",,"$13,335,000",,"$13,335,000",,"$13,335,000",Player,,
Brandon Clarke,MEM,"$12,500,000",,"$12,500,000",,,,,,
Dylan Harper,SAS,"$12,370,320",,"$12,989,040",,"$13,607,760",Team,,,,
Isaiah Joe,OKC,"$12,362,338",,"$11,323,006",,"$11,323,006",Team,,,,
Jabari Smith Jr.,HOU,"$12,350,392",Team,,,,,,,,
Donte DiVincenzo,MIN,"$11,990,000",,"$12,535,000",,,,,,
Brandon Miller,CHO,"$11,968,800",Team,,,,,,,,
Alex Sarr,WAS,"$11,808,240",,"$12,370,680",Team,,,,,,
Davion Mitchell,MIA,"$11,600,000",,"$12,400,000",,,,,,
Moses Moody,GSW,"$11,574,075",,"$12,500,000",,"$13,425,925",,,,
Jarred Vanderbilt,LAL,"$11,571,429",,"$12,428,571",,"$13,285,714",Player,,,,
Matisse Thybulle,POR,"$11,550,000",Player,,,,,,,,
Gabe Vincent,ATL,"$11,500,000",,,,,,,,
Keegan Murray,SAC,"$11,144,093",Team,,,,,,,,
VJ Edgecombe,PHI,"$11,108,880",,"$11,663,880",,"$12,219,720",Team,,,,
Aaron Nesmith,IND,"$11,000,000",,"$11,000,000",,"$19,418,000",,"$20,971,440",,
Luke Kornet,SAS,"$11,000,000",,"$10,450,000",,"$9,900,000",,"$9,350,000",Team,,
Isaac Okoro,CHI,"$11,000,000",,"$11,814,814",,,,,,
Luke Kennard,LAL,"$11,000,000",,,,,,,,
Maxi Kleber,LAL,"$11,000,000",,,,,,,,
Wendell Carter Jr.,ORL,"$10,850,000",,"$18,102,000",,"$19,550,160",,"$20,998,320",Team,,
Mike Conley,CHO,"$11,499,872",,,,,,,,
Scoot Henderson,POR,"$10,748,040",Team,,,,,,,,
Jordan Clarkson,UTA,"$12,947,835",,,,,,,,
Reed Sheppard,HOU,"$10,603,560",,"$11,108,880",Team,,,,,,
Jonas Valančiūnas,DEN,"$10,395,000",,"$10,000,000",,,,,,
T.J. McConnell,IND,"$10,200,000",,"$11,000,000",,"$11,800,000",,"$11,800,000",Team,,
Royce O'Neale,PHO,"$10,125,000",,"$10,875,000",,"$11,625,000",,,,
Jaden Ivey,CHI,"$10,107,163",Team,,,,,,,,
Aaron Wiggins,OKC,"$10,102,803",,"$9,224,300",,"$8,345,797",,"$8,345,797",Team,,
Sam Hauser,BOS,"$10,044,644",,"$10,848,215",,"$11,651,785",,"$12,455,356",,
Kon Knueppel,CHO,"$10,015,680",,"$10,516,560",,"$11,017,560",Team,,,,
Derrick Jones Jr.,LAC,"$10,000,000",,"$10,476,190",,,,,,
Lonzo Ball,UTA,"$10,000,000",,,,,,,,
Amen Thompson,HOU,"$9,690,600",Team,,,,,,,,
Caleb Martin,DAL,"$9,594,044",,"$10,001,493",,"$9,371,351",Player,,,,
Stephon Castle,SAS,"$9,560,520",,"$10,015,920",Team,,,,,,
Pat Connaughton,CHO,"$10,739,683",Player,,,,,,,,
Buddy Hield,ATL,"$9,219,512",,"$9,658,536",,"$10,097,560",Player,,,,
Kyle Anderson,MEM,"$9,219,512",,,,,,,,
Bennedict Mathurin,LAC,"$9,187,573",Team,,,,,,,,
Ace Bailey,UTA,"$9,069,840",,"$9,523,080",,"$9,976,560",Team,,,,
Naji Marshall,DAL,"$9,000,000",,"$9,428,571",,,,,,
Jalen Smith,CHI,"$9,000,000",,"$9,428,571",,,,,,
Ty Jerome,MEM,"$8,781,000",,"$9,220,050",,"$9,659,100",Player,,,,
Ausar Thompson,DET,"$8,775,000",Team,,,,,,,,
Brook Lopez,LAC,"$8,750,000",,"$9,187,500",Team,,,,,,
Quentin Grimes,PHI,"$8,741,209",,,,,,,,
Ron Holland,DET,"$8,657,280",,"$9,069,600",Team,,,,,,
Sam Merrill,CLE,"$8,482,144",,"$9,160,715",,"$9,839,285",,"$10,517,856",,
Jaylin Williams,OKC,"$8,450,704",,"$7,774,648",,"$7,774,648",Team,,,,
Shaedon Sharpe,POR,"$8,399,983",Team,,,,,,,,
Kelly Oubre Jr.,PHI,"$8,382,150",Player,,,,,,,,
Goga Bitadze,ORL,"$8,333,333",,"$7,608,696",,,,,,
Simone Fontecchio,MIA,"$8,307,692",,,,,,,,
Tre Johnson,WAS,"$8,237,640",,"$8,649,600",,"$9,061,680",Team,,,,
Georges Niang,MEM,"$8,200,000",,,,,,,,
Zeke Nnaji,DEN,"$8,177,778",,"$7,466,667",,"$7,466,667",Player,,,,
Tre Mann,CHO,"$8,000,000",,"$8,000,000",,"$8,000,000",Team,,,,
Tre Jones,CHI,"$8,000,000",,"$8,000,000",,"$8,000,000",Team,,,,
Kevon Looney,NOP,"$8,000,000",,"$8,000,000",Team,,,,,,
Anthony Black,ORL,"$7,970,280",Team,,,,,,,,
Tidjane Salaün,CHO,"$7,863,240",,"$8,237,880",Team,,,,,,
Max Christie,DAL,"$7,714,286",,"$8,285,714",,"$8,857,143",Player,,,,
Dyson Daniels,ATL,"$7,707,709",Team,,,,,,,,
Isaiah Jackson,LAC,"$7,600,000",,"$7,000,000",,"$6,400,000",,,,
Jeremiah Fears,NOP,"$7,520,040",,"$7,896,240",,"$8,271,960",Team,,,,
Ayo Dosunmu,MIN,"$7,518,518",,,,,,,,
Bilal Coulibaly,WAS,"$7,275,600",Team,,,,,,,,
Payton Pritchard,BOS,"$7,232,143",,"$7,767,857",,"$8,303,571",,,,
Donovan Clingan,POR,"$7,178,400",,"$7,519,920",Team,,,,,,
Kenrich Williams,OKC,"$7,163,000",,"$7,163,000",Team,,,,,,
Jeremy Sochan,SAS,"$7,874,853",Team,,,,,,,,
Tyus Jones,DAL,"$7,000,000",,,,,,,,
Egor Dёmin,BRK,"$6,889,200",,"$7,233,720",,"$7,578,240",Team,,,,
Jevon Carter,CHI,"$7,680,524",Player,,,,,,,,
Clint Capela,HOU,"$6,700,000",,"$7,035,000",,"$7,370,000",,,,
Ousmane Dieng,MIL,"$6,670,882",Team,,,,,,,,
Jarace Walker,IND,"$6,665,520",Team,,,,,,,,
Dean Wade,CLE,"$6,623,456",,,,,,,,
Jalen Williams,OKC,"$6,580,997",Team,,,,,,,,
Rob Dillingham,CHI,"$6,576,120",,"$6,889,320",Team,,,,,,
Jalen Duren,DET,"$6,483,144",Team,,,,,,,,
Ochai Agbaji,BRK,"$6,383,525",Team,,,,,,,,
Collin Murray-Boyles,TOR,"$6,332,520",,"$6,649,560",,"$6,966,000",Team,,,,
Mark Williams,PHO,"$6,276,531",Team,,,,,,,,
Day'Ron Sharpe,BRK,"$6,250,000",,"$6,250,000",Team,,,,,,
Ziaire Williams,BRK,"$6,250,000",,"$6,250,000",Team,,,,,,
John Konchar,UTA,"$6,165,000",,"$6,165,000",,,,,,
Taylor Hendricks,MEM,"$6,127,080",Team,,,,,,,,
Saddiq Bey,NOP,"$6,118,644",,"$6,440,678",,,,,,
Zach Edey,MEM,"$6,045,000",,"$6,332,760",Team,,,,,,
Khaman Maluach,PHO,"$6,016,080",,"$6,316,680",,"$6,617,160",Team,,,,
Jaden Hardy,WAS,"$6,000,000",,"$6,000,000",,"$6,000,000",Team,,,,
Jake LaRavia,LAL,"$6,000,000",,"$6,000,000",,,,,,
Cam Thomas,BRK,"$6,837,779",,,,,,,,
Cason Wallace,OKC,"$5,820,240",Team,,,,,,,,
Cody Williams,UTA,"$5,742,480",,"$6,015,600",Team,,,,,,
Cedric Coward,MEM,"$5,715,120",,"$6,001,080",,"$6,286,920",Team,,,,
D'Angelo Russell,WAS,"$5,685,000",,"$5,969,250",Player,,,,,,
Al Horford,GSW,"$5,685,000",,"$5,969,250",Player,,,,,,
Tari Eason,HOU,"$5,675,766",Team,,,,,,,,
Haywood Highsmith,BRK,"$6,443,984",,"$3,018,158",,,,,,
Nicolas Batum,LAC,"$5,601,600",,"$5,881,680",Team,,,,,,
Jett Howard,ORL,"$5,529,720",Team,,,,,,,,
Guerschon Yabusele,CHI,"$5,500,000",,,,,,,,
Matas Buzelis,CHI,"$5,455,560",,"$5,715,360",Team,,,,,,
Noa Essengue,CHI,"$5,429,520",,"$5,701,200",,"$5,972,760",Team,,,,
Kris Dunn,LAC,"$5,426,400",,"$5,684,800",,,,,,
Dario Šarić,DET,"$5,426,400",Player,,,,,,,,
Dalen Terry,NOP,"$5,399,118",Team,,,,,,,,
Paul Reed,DET,"$5,335,894",,"$5,602,689",,,,,,
Dereck Lively II,DAL,"$5,253,360",Team,,,,,,,,
Nikola Topić,OKC,"$5,182,920",,"$5,429,760",Team,,,,,,
Derik Queen,NOP,"$5,157,960",,"$5,416,080",,"$5,673,840",Team,,,,
Kevin Porter Jr.,MIL,"$5,134,000",,"$5,390,700",Player,,,,,,
Andre Drummond,PHI,"$5,000,000",Player,,,,,,,,
Moritz Wagner,ORL,"$5,000,000",,,,,,,,
Nick Richards,CHI,"$5,000,000",,,,,,,,
Gradey Dick,TOR,"$4,990,560",Team,,,,,,,,
Malaki Branham,CHO,"$4,962,033",Team,,,,,,,,
Devin Carter,SAC,"$4,923,720",,"$5,158,080",Team,,,,,,
Christian Braun,DEN,"$4,921,797",Team,,,,,,,,
Carter Bryant,SAS,"$4,900,320",,"$5,145,360",,"$5,390,640",Team,,,,
Walker Kessler,UTA,"$4,878,938",Team,,,,,,,,
Jordan Hawkins,NOP,"$4,741,320",Team,,,,,,,,
Bub Carrington,WAS,"$4,677,600",,"$4,900,560",Team,,,,,,
Thomas Sorber,OKC,"$4,655,040",,"$4,887,720",,"$5,120,400",Team,,,,
Kobe Bufkin,BRK,"$5,480,297",Team,,,,,,,,
Jose Alvarado,NYK,"$4,500,000",,"$4,500,000",Player,,,,,,
Nikola Jović,MIA,"$4,445,417",Team,,,,,,,,
Kel'el Ware,MIA,"$4,443,360",,"$4,654,920",Team,,,,,,
Yang Hansen,POR,"$4,422,360",,"$4,643,520",,"$4,864,920",Team,,,,
Peyton Watson,DEN,"$4,356,476",Team,,,,,,,,
Miles McBride,NYK,"$4,333,333",,"$3,956,523",,,,,,
Keyonte George,UTA,"$4,278,960",Team,,,,,,,,
Jared McCain,OKC,"$4,221,360",,"$4,422,600",Team,,,,,,
Joan Beringer,MIN,"$4,201,080",,"$4,411,200",,"$4,621,200",Team,,,,
Kevin Love,UTA,"$4,150,000",,,,,,,,
Dalton Knecht,LAL,"$4,010,160",,"$4,201,080",Team,,,,,,
Ryan Rollins,MIL,"$4,000,000",,"$4,000,000",,"$4,000,000",Player,,,,
Dwight Powell,DAL,"$4,000,000",Player,,,,,,,,
Walter Clayton,MEM,"$3,991,320",,"$4,190,520",,"$4,390,320",Team,,,,
Jaime Jaquez Jr.,MIA,"$3,861,600",Team,,,,,,,,
Nolan Traoré,BRK,"$3,811,560",,"$4,002,000",,"$4,193,040",Team,,,,
Daniss Jenkins,DET,"$3,809,524",,"$4,000,000",Team,,,,,,
Tristan Da Silva,ORL,"$3,809,520",,"$3,991,200",Team,,,,,,
Cole Anthony,MEM,"$5,996,274",,"$3,700,000",,"$3,700,000",,,,
Gary Trent Jr.,MIL,"$3,697,105",,"$3,881,960",Player,,,,,,
Brandin Podziemski,GSW,"$3,687,960",Team,,,,,,,,
Svi Mykhailiuk,UTA,"$3,675,000",,"$3,850,000",,"$4,025,000",Team,,,,
Kasparas Jakučionis,MIA,"$3,658,800",,"$3,841,680",,"$4,024,440",Team,,,,
Ja'Kobe Walter,TOR,"$3,638,160",,"$3,811,800",Team,,,,,,
Gary Harris,MIL,"$3,634,153",,"$3,815,861",Player,,,,,,
Cam Whitmore,WAS,"$3,539,760",Team,,,,,,,,
Will Riley,WAS,"$3,512,520",,"$3,688,320",,"$3,864,000",Team,,,,
Jaylon Tyson,CLE,"$3,492,480",,"$3,658,560",Team,,,,,,
Jaxson Hayes,LAL,"$3,449,323",,,,,,,,
Dominick Barlow,PHI,"$3,415,000",,"$3,415,000",Team,,,,,,
Noah Clowney,BRK,"$3,398,640",Team,,,,,,,,
Drake Powell,BRK,"$3,372,240",,"$3,540,600",,"$3,709,320",Team,,,,
Yves Missi,NOP,"$3,353,040",,"$3,512,760",Team,,,,,,
Blake Wesley,WAS,"$5,643,732",Team,,,,,,,,
Taurean Prince,MIL,"$3,303,774",,"$3,815,861",Player,,,,,,
Dariq Whitehead,BRK,"$3,262,560",Team,,,,,,,,
Asa Newell,ATL,"$3,237,480",,"$3,399,480",,"$3,560,880",Team,,,,
DaRon Holmes,DEN,"$3,218,760",,"$3,372,120",Team,,,,,,
Kris Murray,POR,"$3,132,000",Team,,,,,,,,
Nique Clifford,SAC,"$3,108,120",,"$3,263,400",,"$3,418,800",Team,,,,
Nassir Little,PHO,"$3,107,143",,"$3,107,143",,"$3,107,143",,"$3,107,143",,
AJ Johnson,DAL,"$3,090,480",,"$3,237,120",Team,,,,,,
De'Anthony Melton,GSW,"$3,080,921",,"$3,451,779",Player,,,,,,
Kyle Filipowski,UTA,"$3,000,000",,"$3,000,000",,"$3,000,000",Team,,,,
Ajay Mitchell,OKC,"$3,000,000",,"$2,850,000",,"$2,850,000",Team,,,,
Julian Champagnie,SAS,"$3,000,000",,"$3,000,000",Team,,,,,,
Jase Richardson,ORL,"$2,983,320",,"$3,132,360",,"$3,282,000",Team,,,,
Kyshawn George,WAS,"$2,966,760",,"$3,108,000",Team,,,,,,
Tony Bradley,IND,"$3,204,816",Team,,,,,,,,
Marcus Sasser,DET,"$2,886,720",Team,,,,,,,,
Ben Saraf,BRK,"$2,884,560",,"$3,028,560",,"$3,172,920",Team,,,,
Pacôme Dadiet,NYK,"$2,847,600",,"$2,983,680",Team,,,,,,
Danny Wolf,BRK,"$2,801,280",,"$2,941,440",,"$3,081,840",Team,,,,
Ben Sheppard,IND,"$2,790,720",Team,,,,,,,,
Hugo González,BOS,"$2,783,880",,"$2,923,560",,"$3,062,640",Team,,,,
Liam McNeeley,CHO,"$2,763,960",,"$2,902,080",,"$3,040,320",Team,,,,
Dillon Jones,WAS,"$2,753,280",,,,,,,,
Yanic Konan Niederhäuser,LAC,"$2,743,800",,"$2,880,960",,"$3,018,480",Team,,,,
Nick Smith Jr.,CHO,"$2,710,680",Team,,,,,,,,
Brice Sensabaugh,UTA,"$2,693,760",Team,,,,,,,,
Julian Strawther,DEN,"$2,674,200",Team,,,,,,,,
Terrence Shannon Jr.,MIN,"$2,674,080",,"$2,801,640",Team,,,,,,
Ryan Dunn,PHO,"$2,657,760",,"$2,784,240",Team,,,,,,
Kobe Brown,IND,"$2,654,880",Team,,,,,,,,
Isaiah Collier,UTA,"$2,638,200",,"$2,763,960",Team,,,,,,
Baylor Scheierman,BOS,"$2,619,000",,"$2,744,040",Team,,,,,,
Xavier Tillman Sr.,CHO,"$2,546,675",,,,,,,,
Cam Spencer,MEM,"$2,537,989",,"$2,411,090",,"$2,616,754",,"$2,830,685",Team,,
Luka Garza,BOS,"$2,461,463",,"$2,801,346",,,,,,
Sandro Mamukelashvili,TOR,"$2,461,463",,"$2,801,346",Player,,,,,,
Trendon Watford,PHI,"$2,461,463",,"$2,801,346",Team,,,,,,
Jericho Sims,MIL,"$2,461,463",,"$2,801,346",Player,,,,,,
Dru Smith,MIA,"$2,378,870",,"$2,584,539",,"$2,934,742",Team,,,,
Josh Minott,BRK,"$2,378,870",,"$2,584,539",Team,,,,,,
Justin Champagnie,WAS,"$2,349,578",,"$2,667,944",,"$3,005,085",Team,,,,
Jordan Goodwin,PHO,"$2,349,578",Team,,,,,,,,
Jay Huff,IND,"$2,349,578",,"$2,667,944",,"$3,005,085",,,,
Keon Johnson,BRK,"$2,349,578",,,,,,,,
Vít Krejčí,POR,"$2,349,578",,"$2,667,944",,"$3,005,085",Team,,,,
Neemias Queta,BOS,"$2,349,578",,"$2,667,944",Team,,,,,,
A.J. Green,MIL,"$2,301,587",,"$10,044,644",,"$10,848,215",,"$11,651,786",,"$12,455,355",
Vince Williams Jr.,UTA,"$2,301,587",,,,,,,,
Keon Ellis,CLE,"$2,301,587",Team,,,,,,,,
Ryan Kalkbrenner,CHO,"$2,296,274",,"$2,411,090",,"$2,525,901",,"$2,735,698",Team,,
Sion James,CHO,"$2,296,274",,"$2,411,090",,"$2,525,901",,"$2,735,698",Team,,
Danté Exum,WAS,"$2,296,274",,,,,,,,
Anthony Gill,WAS,"$2,296,274",,,,,,,,
Chris Boucher,UTA,"$2,296,274",,,,,,,,
Chris Paul,TOR,"$2,296,274",,,,,,,,
Garrett Temple,TOR,"$2,296,274",,,,,,,,
Bismack Biyombo,SAS,"$2,296,274",,,,,,,,
Lindy Waters III,SAS,"$2,296,274",,,,,,,,
Jordan McLaughlin,SAS,"$2,296,274",,,,,,,,
Russell Westbrook,SAC,"$2,296,274",,,,,,,,
Doug McDermott,SAC,"$2,296,274",,,,,,,,
Drew Eubanks,SAC,"$2,296,274",,,,,,,,
Amir Coffey,PHO,"$2,296,274",,,,,,,,
Collin Gillespie,PHO,"$2,296,274",,,,,,,,
Kyle Lowry,PHI,"$2,296,274",,,,,,,,
Mason Plumlee,OKC,"$3,022,108",,,,,,,,
Landry Shamet,NYK,"$2,296,274",,,,,,,,
Bones Hyland,MIN,"$2,296,274",,,,,,,,
Joe Ingles,MIN,"$2,296,274",,,,,,,,
Thanasis Antetokounmpo,MIL,"$2,296,274",,,,,,,,
Eric Gordon,MEM,"$2,296,274",,,,,,,,
Josh Okogie,HOU,"$2,296,274",,,,,,,,
Jeff Green,HOU,"$2,296,274",,,,,,,,
Aaron Holiday,HOU,"$2,296,274",,,,,,,,
Jae'Sean Tate,HOU,"$2,296,274",,,,,,,,
Gary Payton II,GSW,"$2,296,274",,,,,,,,
Javonte Green,DET,"$2,296,274",,,,,,,,
Tim Hardaway Jr.,DEN,"$2,296,274",,,,,,,,
Bruce Brown,DEN,"$2,296,274",,,,,,,,
Marvin Bagley III,DAL,"$2,296,274",,,,,,,,
Thomas Bryant,CLE,"$2,296,274",,,,,,,,
Larry Nance Jr.,CLE,"$2,296,274",,,,,,,,
Keaton Wallace,ATL,"$2,296,274",,,,,,,,
Jock Landale,ATL,"$2,296,274",,,,,,,,
Scotty Pippen Jr.,MEM,"$2,270,735",,"$2,461,462",,"$2,789,215",,,,
JD Davison,BOS,"$2,270,735",Team,,,,,,,,
Brandon Williams,DAL,"$2,270,735",,,,,,,,
Moussa Diabaté,CHO,"$2,270,735",,"$2,461,462",,,,,,
DeAndre Jordan,NOP,"$2,269,880",,,,,,,,
Toumani Camara,POR,"$2,221,677",,"$18,080,358",,"$19,526,786",,"$20,973,214",,"$22,419,642",
Rayan Rupert,POR,"$2,353,647",Team,,,,,,,,
Julian Phillips,MIN,"$2,221,677",,"$2,406,205",Team,,,,,,
GG Jackson II,MEM,"$2,221,677",,"$2,406,205",Team,,,,,,
Gui Santos,GSW,"$2,221,677",Team,,,,,,,,
Jalen Pickett,DEN,"$2,221,677",,"$2,406,205",Team,,,,,,
Hunter Tyson,BRK,"$2,221,677",,,,,,,,
Jalen Wilson,BRK,"$2,221,677",Team,,,,,,,,
Jordan Walsh,BOS,"$2,221,677",,"$2,406,205",Team,,,,,,
Trayce Jackson-Davis,TOR,"$2,221,677",,"$2,406,205",Team,,,,,,
Andre Jackson Jr.,MIL,"$2,221,677",,"$2,406,205",Team,,,,,,
Craig Porter Jr.,CLE,"$2,221,677",,"$2,406,205",Team,,,,,,
Leonard Miller,CHI,"$2,221,677",,"$2,406,205",Team,,,,,,
Duop Reath,ATL,"$2,221,677",,,,,,,,
Mouhamed Gueye,ATL,"$2,221,677",,"$2,406,205",Team,,,,,,
JaVale McGee,DAL,"$2,208,856",,"$2,208,856",,"$2,208,856",,,,
Tyler Kolek,NYK,"$2,191,897",,"$2,296,271",,"$2,486,995",Team,,,,
Jaylen Clark,MIN,"$2,191,897",,,,,,,,
Tyrese Martin,BRK,"$2,191,897",Team,,,,,,,,
Precious Achiuwa,SAC,"$2,111,516",,,,,,,,
Justin Edwards,PHI,"$2,048,494",,"$2,411,090",,"$2,616,754",Team,,,,
Nigel Hayes-Davis,MIL,"$2,048,494",,,,,,,,
N'Faly Dante,ATL,"$2,048,494",,,,,,,,
Johnny Furphy,IND,"$1,955,377",,"$2,296,271",,"$2,486,995",Team,,,,
Jonathan Mogbo,TOR,"$1,955,377",,"$2,296,271",Team,,,,,,
Jamal Shead,TOR,"$1,955,377",,"$2,296,271",Team,,,,,,
Oso Ighodaro,PHO,"$1,955,377",,"$2,296,271",,"$2,486,995",Team,,,,
Ariel Hukporti,NYK,"$1,955,377",Team,,,,,,,,
Karlo Matković,NOP,"$1,955,377",,"$2,296,271",Team,,,,,,
Tyler Smith,MIL,"$1,955,377",,,,,,,,
Keshad Johnson,MIA,"$1,955,377",Team,,,,,,,,
Jaylen Wells,MEM,"$1,955,377",,"$2,296,271",,"$2,486,995",Team,,,,
Bronny James,LAL,"$1,955,377",,"$2,296,271",,"$2,486,995",Team,,,,
Cam Christie,LAC,"$1,955,377",,"$2,296,271",,"$2,486,995",Team,,,,
Quinten Post,GSW,"$1,955,377",Team,,,,,,,,
Bobi Klintman,DET,"$1,955,377",,,,,,,,
Isaac Jones,DET,"$1,955,377",Team,,,,,,,,
Drew Timme,BRK,"$1,955,377",Team,,,,,,,,
Jamison Battle,TOR,"$1,955,377",,"$2,296,271",,,,,,
Adem Bona,PHI,"$1,955,377",,"$2,296,271",,"$2,486,995",Team,,,,
Pelle Larsson,MIA,"$1,955,377",,"$2,296,271",Team,,,,,,
Seth Curry,GSW,"$1,755,198",,,,,,,,
Micah Potter,IND,"$1,527,805",,"$2,801,346",Team,,,,,,
Chaz Lanier,DET,"$1,372,870",,"$2,150,917",,"$2,525,901",,"$2,735,698",Team,,
Rasheer Fleming,PHO,"$1,272,870",,"$2,150,917",,"$2,525,901",,"$2,735,698",Team,,
Maxime Raynaud,SAC,"$1,272,870",,"$2,150,917",,"$2,525,901",Team,,,,
Johni Broome,PHI,"$1,272,870",,"$2,150,917",,"$2,525,901",,"$2,735,698",Team,,
Noah Penda,ORL,"$1,272,870",,"$2,150,917",,"$2,525,901",,"$2,735,698",Team,,
Micah Peavy,NOP,"$1,272,870",,"$2,150,917",,"$2,525,901",,"$2,735,698",Team,,
Adou Thiero,LAL,"$1,272,870",,"$2,150,917",,"$2,525,901",Team,,,,
Will Richard,GSW,"$1,272,870",,"$2,150,917",,"$2,525,901",,"$2,735,698",Team,,
Tyrese Proctor,CLE,"$1,272,870",,"$2,150,917",,"$2,525,901",,"$2,735,698",Team,,
Mohamed Diawara,NYK,"$1,272,870",,,,,,,,
Kam Jones,IND,"$1,272,870",,"$2,150,917",,"$2,525,901",,"$2,735,698",Team,,
Nikola Djurisic,ATL,"$1,272,870",,,,,,,,
Olivier-Maxence Prosper,DAL,"$1,002,360",Team,,,,,,,,
James Wiseman,IND,"$1,131,970",,,,,,,,
Pat Spencer,GSW,"$857,804",,,,,,,,
Amari Williams,BOS,"$490,128",,"$2,150,917",,,,,,
Kobe Sanders,LAC,"$475,497",,"$2,150,917",Team,,,,,,
Mamadi Diakite,MEM,"$464,050",,"$464,050",,,,,,
Ricky Rubio,CLE,"$424,672",,"$424,672",,,,,,
Myron Gardner,MIA,"$395,029",,"$2,150,917",,"$2,525,901",,,,
Monte Morris,IND,"$321,184",,,,,,,,
Garrison Mathews,IND,"$429,325",,,,,,,,
Didi Louzada,POR,"$268,032",,"$268,032",,"$268,032",,"$268,032",,
Mac McClung,IND,"$164,060",,,,,,,,
Jeremiah Robinson-Earl,IND,"$131,970",,,,,,,,`

// Parse the CSV data into PlayerContract objects
function parseCSVData(): PlayerContract[] {
  const lines = RAW_DATA.trim().split('\n')
  const players: PlayerContract[] = []
  const seen = new Set<string>() // Track unique player+team combos
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    // Parse CSV properly handling quoted values
    const values: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())
    
    const [name, team, sal2526, opt2526, sal2627, opt2627, sal2728, opt2728, sal2829, opt2829, sal2930, opt2930] = values
    
    if (!name || !team) continue
    
    // Skip duplicates (same player+team)
    const key = `${name}-${team}`
    if (seen.has(key)) continue
    seen.add(key)
    
    const salary: Partial<Record<Season, number>> = {}
    const options: Partial<Record<Season, 'Player' | 'Team'>> = {}
    
    const s2526 = parseSalary(sal2526)
    const s2627 = parseSalary(sal2627)
    const s2728 = parseSalary(sal2728)
    const s2829 = parseSalary(sal2829)
    const s2930 = parseSalary(sal2930)
    
    if (s2526 > 0) salary['2025-26'] = s2526
    if (s2627 > 0) salary['2026-27'] = s2627
    if (s2728 > 0) salary['2027-28'] = s2728
    if (s2829 > 0) salary['2028-29'] = s2829
    if (s2930 > 0) salary['2029-30'] = s2930
    
    const o2526 = parseOption(opt2526)
    const o2627 = parseOption(opt2627)
    const o2728 = parseOption(opt2728)
    const o2829 = parseOption(opt2829)
    const o2930 = parseOption(opt2930)
    
    if (o2526) options['2025-26'] = o2526
    if (o2627) options['2026-27'] = o2627
    if (o2728) options['2027-28'] = o2728
    if (o2829) options['2028-29'] = o2829
    if (o2930) options['2029-30'] = o2930
    
    // Only add if has at least one salary
    if (Object.keys(salary).length > 0) {
      players.push({
        id: `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${team.toLowerCase()}`,
        name,
        team,
        salary,
        options,
      })
    }
  }
  
  return players
}

export const ALL_PLAYERS: PlayerContract[] = parseCSVData()

// Get all unique team codes
export const ALL_TEAMS = [...new Set(ALL_PLAYERS.map(p => p.team))].sort()

// Team name mapping
export const TEAM_NAMES: Record<string, string> = {
  ATL: 'Atlanta Hawks',
  BOS: 'Boston Celtics',
  BRK: 'Brooklyn Nets',
  CHI: 'Chicago Bulls',
  CHO: 'Charlotte Hornets',
  CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks',
  DEN: 'Denver Nuggets',
  DET: 'Detroit Pistons',
  GSW: 'Golden State Warriors',
  HOU: 'Houston Rockets',
  IND: 'Indiana Pacers',
  LAC: 'LA Clippers',
  LAL: 'Los Angeles Lakers',
  MEM: 'Memphis Grizzlies',
  MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks',
  MIN: 'Minnesota Timberwolves',
  NOP: 'New Orleans Pelicans',
  NYK: 'New York Knicks',
  OKC: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic',
  PHI: 'Philadelphia 76ers',
  PHO: 'Phoenix Suns',
  POR: 'Portland Trail Blazers',
  SAC: 'Sacramento Kings',
  SAS: 'San Antonio Spurs',
  TOR: 'Toronto Raptors',
  UTA: 'Utah Jazz',
  WAS: 'Washington Wizards',
}

// Get players for a specific team
export function getTeamRoster(teamCode: string): PlayerContract[] {
  return ALL_PLAYERS.filter(p => p.team === teamCode)
}

// Get free agents (players with contracts ending)
export function getFreeAgents(afterSeason: Season): PlayerContract[] {
  return ALL_PLAYERS.filter(p => {
    const seasons = Object.keys(p.salary) as Season[]
    const lastSeason = seasons[seasons.length - 1]
    return lastSeason === afterSeason
  })
}
