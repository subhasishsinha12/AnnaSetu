#!/bin/bash
# AnnaSetu Hyperledger Fabric Network Setup
# Usage: ./network.sh [up|down|restart|deployCC]

set -e

CHANNEL_NAME="annasetu-channel"
CC_NAME="annasetu"
CC_SRC_PATH="../chaincode"
CC_RUNTIME="node"
CC_VERSION="1.0"

function networkUp() {
    echo "Starting AnnaSetu Fabric Network..."
    docker-compose -f docker-compose-fabric.yml up -d
    echo "Waiting for network to stabilize..."
    sleep 5
    createChannel
    echo "Network is up. Channel: ${CHANNEL_NAME}"
}

function networkDown() {
    echo "Stopping AnnaSetu Fabric Network..."
    docker-compose -f docker-compose-fabric.yml down --volumes
    docker rm -f $(docker ps -aq --filter "name=annasetu") 2>/dev/null || true
    echo "Network stopped."
}

function createChannel() {
    echo "Creating channel: ${CHANNEL_NAME}"
    docker exec cli peer channel create \
        -o orderer.annasetu.com:7050 \
        -c ${CHANNEL_NAME} \
        -f ./channel-artifacts/${CHANNEL_NAME}.tx \
        --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/annasetu.com/orderers/orderer.annasetu.com/msp/tlscacerts/tlsca.annasetu.com-cert.pem
    echo "Channel created. Joining peers..."
    docker exec cli peer channel join -b ${CHANNEL_NAME}.block
}

function deployCC() {
    echo "Packaging chaincode: ${CC_NAME}..."
    docker exec cli peer lifecycle chaincode package ${CC_NAME}.tar.gz \
        --path ${CC_SRC_PATH} --lang ${CC_RUNTIME} \
        --label ${CC_NAME}_${CC_VERSION}
    
    echo "Installing chaincode..."
    docker exec cli peer lifecycle chaincode install ${CC_NAME}.tar.gz
    
    echo "Approving and committing chaincode..."
    PACKAGE_ID=$(docker exec cli peer lifecycle chaincode queryinstalled | grep ${CC_NAME} | sed 's/Package ID: //; s/, Label.*//')
    
    docker exec cli peer lifecycle chaincode approveformyorg \
        -o orderer.annasetu.com:7050 \
        --channelID ${CHANNEL_NAME} --name ${CC_NAME} \
        --version ${CC_VERSION} --package-id ${PACKAGE_ID} \
        --sequence 1 --tls --cafile /etc/hyperledger/orderer-ca.pem
    
    docker exec cli peer lifecycle chaincode commit \
        -o orderer.annasetu.com:7050 \
        --channelID ${CHANNEL_NAME} --name ${CC_NAME} \
        --version ${CC_VERSION} --sequence 1 \
        --tls --cafile /etc/hyperledger/orderer-ca.pem
    
    echo "Chaincode ${CC_NAME} v${CC_VERSION} deployed to ${CHANNEL_NAME}"
}

case "$1" in
    "up")    networkUp ;;
    "down")  networkDown ;;
    "restart") networkDown && networkUp ;;
    "deployCC") deployCC ;;
    *) echo "Usage: ./network.sh [up|down|restart|deployCC]" ;;
esac
