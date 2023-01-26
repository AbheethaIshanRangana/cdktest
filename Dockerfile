# base image
FROM python:3.9
# setup environment variable
ENV DockerHome=/home/app/webapp
# set working directory
RUN mkdir -p ${DockerHome}
# where your code lives
WORKDIR ${DockerHome}
# install dependencies
RUN pip install --upgrade pip
# copy whole project to docker home directory
COPY testapp ${DockerHome}
COPY requirements.txt ${DockerHome}
# install all dependencies
RUN pip install -r requirements.txt
# port expose
EXPOSE 8000
# start server
CMD [ "sh", "start.sh" ]