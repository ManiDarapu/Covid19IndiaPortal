const express = require("express");
const app = express();

app.use(express.json());

const {open} = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

//initialization
let db = null;
const initializeDbAndServer = async ()=>{
    try{
        db = await open({
        filename: dbPath,
        driver : sqlite3.Database,
    });
    app.listen(3001, ()=>
    console.log("Server is Running"));
} catch(e){
console.log("DB Error:${e.message}");
process.exit(1);
}
};
initializeDbAndServer();

//convert to camelCase
const convertDbObjToResponseObj = (dbObject)=>{
    return{
        stateId : dbObject.state_id,
        stateName : dbObject.state_name,
        population : dbObject.population,
        districtId : dbObject.district_id,
        districtName : dbObject.district_name,
        cases : dbObject.cases,
        cured : dbObject.cured,
        active : dbObject.active,
        deaths : dbObject.deaths,
    }
};

const authenticateToken = (request, response, next)=>{
    let jwtToken;
    const authHeader = request.headers["authorization"];
    if (authHeader!== undefined){
        jwtToken = authHeader.split(" ")[1];
    }
    if (jwtToken===undefined){
        response.status(401);
        response.send("Invalid JWT Token");
    } else{
        jwt.verify(jwtToken, "My_Secret_Token", async(error, payload)=>{
            if(error){
                response.status(401);
                response.send("Invalid JWT Token");
            }else{
                next();
            }
        })
    }
}

//login
app.post("/login/", async(request, response)=>{
    const {username, password}= request.body;
    const checkUsername = `SELECT * FROM user WHERE username = "${username}";`;
    const dbUser = await db.get(checkUsername);
    if (dbUser!== undefined){
        const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
        if (isPasswordMatched){
            const payload = {username : username};
            const jwtToken = jwt.sign(payload, "My_Secret_Token");
            response.send({jwtToken});
        }else{
            response.status(400);
            response.send("Invalid password");
        }
    }else{
        response.status(400);
        response.send("Invalid user");
    }
})

//Get all states
app.get("/states/",authenticateToken, async (request, response)=>{
    const getStatesQuery = `SELECT * FROM state;`;
    const statesArray = await db.all(getStatesQuery);
    response.send(statesArray.map((each)=> convertDbObjToResponseObj(each)));
});

//Get state details with stateId
app.get("/states/:stateId/",authenticateToken, async (request, response)=>{
    const { stateId } = request.params;
    const getStateQuery = `SELECT * FROM state WHERE state_id = ${ stateId };`;
    const state = await db.get(getStateQuery);
    response.send(convertDbObjToResponseObj(state));
});

//post given district details
app.post("/districts/",authenticateToken, async (request, response)=>{
    const districtDetails = request.body;
    const {districtName, stateId, cases, cured, active, deaths} = districtDetails;
    const postDistrictQuery = `INSERT INTO district (district_name, state_id, cases, cured, active, deaths)
    VALUES ("${districtName}", "${stateId}", "${cases}", "${cured}", "${active}", "${deaths}");`;
    await db.run(postDistrictQuery);
    response.send("District Successfully Added");
});

//Get district details with given district Id
app.get("/districts/:districtId/",authenticateToken, async (request, response)=>{
    const { districtId } = request.params;
    const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${ districtId };`;
    const district = await db.get(getDistrictQuery);
    response.send(convertDbObjToResponseObj(district));
});

//Delete
app.delete("/districts/:districtId/",authenticateToken, async (request, response)=>{
    const {districtId} = request.params;
    const deleteDistrictQuery = `DELETE FROM district WHERE district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
});

//update district details
app.put("/districts/:districtId/",authenticateToken, async (request, response)=>{
    const {districtId} = request.params;
    const {districtName, stateId, cases, cured, active, deaths} = request.body;
    const updateDistrictQuery = `UPDATE district 
    SET 
    district_id = ${districtId},
    district_name = "${districtName}",
    state_id = ${stateId}, cases = ${cases},
    active = ${active}, deaths = ${deaths}
    WHERE district_id = ${districtId};`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
});

//Get state name with given district id
app.get("/districts/:districtId/details/", async(request, response)=>{
    const {districtId} = request.params;
    const getStateQuery = `SELECT state_name FROM state join district WHERE state.state_id = district.state_id;`;
    const state = await db.get(getStateQuery);
    response.send(convertDbObjToResponseObj(state));
});

//Get totals
app.get("/states/:stateId/stats/",authenticateToken, async (request, response)=>{
    const {stateId} = request.params;
    const getTotalsStatsQuery = `SELECT SUM(cases), 
    SUM(cured), SUM(active), SUM(deaths) FROM 
    district WHERE state_id = ${stateId};`;
    const stats = await db.get(getTotalsStatsQuery);
    console.log(stats);
    response.send({
        totalCases : stats["SUM(cases)"],
        totalCured : stats["SUM(cured)"],
        totalActive : stats["SUM(active)"],
        totalDeaths : stats["SUM(deaths)"],
    });
});

module.exports = app;