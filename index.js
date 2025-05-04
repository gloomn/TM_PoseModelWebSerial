let accuracy, URL, model, webcam, ctx, currentPose, maxPredictions, port, acc;

//정확도 설정정
function setAccuracy() {
  accuracy = parseFloat(document.getElementById("accuracy-input").value);
  document.getElementById("saved-accuracy").innerText = accuracy;
}

//Teachable Machine url 설정
function setURL() {
  URL = document.getElementById("url-input").value;
  document.getElementById('saved-url').innerText = URL;
}

async function startMachine() {
  const modelURL = URL + "model.json";
  const metadataURL = URL + "metadata.json";

  model = await tmPose.load(modelURL, metadataURL);
  maxPredictions = model.getTotalClasses(); //모든 동작 클래스스

  webcam = new tmPose.Webcam(600, 400, true);
  await webcam.setup();
  await webcam.play();
  window.requestAnimationFrame(loop);

  const canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  currentPose = document.getElementById("current-pose");
  currentPose.appendChild(document.createElement("div"));

}

async function connectToSerial()
{
    if ('serial' in navigator) {
      try {

        if(port && port.readable)
        {
          alert("장치가 이미 연결되어 있습니다!");
          return;
        }

        console.log("Before serial request");
        port = await navigator.serial.requestPort();
        console.log("After serial request");
        await port.open({ baudRate: 115200 });
        console.log("After port open");
        document.getElementById("connectionStatus").innerText = "✅연결되었습니다."
        alert("장치가 연결되었습니다!");

         // 장치 이름을 가져오기
         const portInfo = await port.getInfo();
         const deviceName = portInfo.usbVendorId ? `${portInfo.usbVendorId}` : `Device: ${portInfo.serialNumber || "Unknown"}`;
 
         // UI에 장치 이름 표시
         document.getElementById("connectedDevice").innerText = `${deviceName}`;

      } 
      catch (error) 
      {
        if (error.name === 'NotFoundError') 
          {
            alert("포트 선택이 취소되었습니다!");
          } 
          else 
          {
          console.error('Error:', error);
          alert(`에러: ${error.message}`);
        }
      }
    } else {
      console.error('Web Serial API is not available.');
    }
}

//여러번 호출되어 alert가 누적되는 버그로 인해 한번만 addEventListener에 등록
document.getElementById("connect-to-serial").addEventListener("click", connectToSerial);

async function disconnectToSerial() {
    // 포트가 열려 있고, port.readable 속성으로 열린 상태를 체크
    if (port && port.readable) {
      try {
        // 포트 닫기
        await port.close();
        console.log("Serial port disconnected");

        // 연결 상태를 UI에 표시
        document.getElementById("connectionStatus").innerText = "❌연결이 해제되었습니다.";
        document.getElementById("connectedDevice").innerText = " - ";
        alert("장치가 연결 해제되었습니다!");
      } catch (error) {
        console.error("Error while closing port:", error);
        alert(error);
      }
    } else {
      console.error("No port is connected.");
      alert("No port is connected");
    }
}

document.getElementById("disconnect-serial").addEventListener("click", disconnectToSerial);

async function loop(_timestamp) {
    webcam.update();
    await predict();
    window.requestAnimationFrame(loop);
}

async function predict() {
    const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
    const prediction = await model.predict(posenetOutput);

    let max = 0, index = -1, maxStringPrediction = '';
    for (let i = 0; i < maxPredictions; i++) {
      const classPrediction = prediction[i].className + ": " + prediction[i].probability.toFixed(2);
      acc = Math.round(Number(prediction[i].probability.toFixed(2)) * 10000) / 100;
      if (acc > max) {
        max = acc;
        index = i;
        maxStringPrediction = classPrediction;
      }
    }

    if (max > accuracy && index >= 0) {
      if (port && port.writable) {
        const writer = port.writable.getWriter();
        const data = new TextEncoder().encode(prediction[index].className);
        await writer.write(data);
        writer.releaseLock();
      }

      currentPose.childNodes[0].innerHTML = maxStringPrediction;
    }

    drawPose(pose);
  }


/*
pose: 사람의 관절 위치 정보(keypoints)
posenetOutput: 분류 예측에 필요한 중간 데이터

prediction: 각 클래스(동작 이름)의 확률 배열을 반환

max: 가장 높은 확률값을 저장하는 변수
imax: 그에 해당하는 인덱스를 저장하는 변수
maxStringPrediction: 해당 클래스(동작) 이름과 확률을 문자열로 저장하는 변수
for문은 모델이 가진 클래스 수만큼 반복

i번째 클래스의 이름과 확률을 문자열로 조합

확률을 퍼센트 단위로 변환함

현재 확률이 지금까지 높다면(if(acc > max))

가장 높은 확률값과 해당 클래스(동작) 정보를 저장

설정한 정확도보다 확률이 높고, 유효한 클래스 인덱스이면 실행

시리얼 포트가 연결되어 있고 쓰기가 가능하면

데이터를 쓰기 위한 writer 객체 생성

예측된 클래스 이름을 텍스트 -> 바이트로 변환

데이터를 시리얼 포트로 전송

writer을 해제해서 다른 곳에서도 포트를 사용할 수 있게 함

UI에 예측된 클래스의 이름과 확률을 표시

추정된 포즈를 캔버스에 그려줌(keypoints, skeleton 등)
*/


function drawPose(pose) {
  if (webcam.canvas) {
    ctx.drawImage(webcam.canvas, 0, 0, canvas.width, canvas.height);

    if (pose) {
      const minimumAccuracy = 0.5;

      // 스케일 비율 계산
      const scaleX = canvas.width / webcam.canvas.width;
      const scaleY = canvas.height / webcam.canvas.height;

      // keypoints 좌표를 복사 + 스케일 조정
      const scaledKeypoints = pose.keypoints.map(k => ({
        ...k,
        position: {
          x: k.position.x * scaleX,
          y: k.position.y * scaleY
        }
      }));

      // 그리기
      tmPose.drawKeypoints(scaledKeypoints, minimumAccuracy, ctx);
      tmPose.drawSkeleton(scaledKeypoints, minimumAccuracy, ctx);
    }
  }
}
